import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  FlatList,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { takeTaskPhoto } from '../../src/utils/camera';
import { apiService } from '../../src/services/api.service';
import { syncQueue, generateClientId } from '../../src/sync/sync-queue';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { useSyncStore } from '../../src/stores/sync.store';
import { useBuildingStore, RejectionReason } from '../../src/stores/building.store';
import { SyncStatusBar } from '../../src/components/SyncStatusBar';
import { BrandedScreenHeader } from '../../src/components/BrandedScreenHeader';
import { COLORS } from '../../src/constants/colors';
import { isNetworkError } from '../../src/utils/network';
import {
  CustomFieldPickerModal,
  hasTaskCustomFields,
  type TaskCustomField,
  type TaskFieldValueInput,
} from '../../src/components/CustomFieldPickerModal';

const RECONCILE_DELAYS_MS = [0, 500, 1200, 2500] as const;

interface PeriodicDueItem {
  id: string;
  taskId: string;
  periodLabel: string;
  status: string;
  task: {
    id: string;
    name: string;
    zoneId: string;
    subzoneId: string | null;
    requiresPhoto: boolean;
    requiresRejectionReason: boolean;
    customFields?: TaskCustomField[];
  };
  execution: {
    id: string;
    status: string;
    photos: { id: string; url: string }[];
    fieldValues?: TaskFieldValueInput[];
  } | null;
}

interface SubzoneGroup {
  subId: string;
  subName: string;
  tasks: PeriodicDueItem[];
}

interface ZoneGroup {
  zoneId: string;
  zoneName: string;
  zoneIndex: number;
  subzones: SubzoneGroup[];
  tasks: PeriodicDueItem[];
}

interface FloorGroup {
  floorId: string;
  floorName: string;
  floorShort: string;
  zones: ZoneGroup[];
  tasks: PeriodicDueItem[];
}

const STATUS_LABELS: Record<string, string> = {
  DONE: 'Realizada',
  NOT_DONE: 'No realizada',
  SKIPPED: 'Omitida',
};

const DONE_PHOTO_PENDING_LABEL = 'Realizada con foto pendiente';

function isDoneWithPendingPhoto(item: PeriodicDueItem): boolean {
  return (
    item.execution?.status === 'DONE' &&
    item.task.requiresPhoto &&
    (item.execution?.photos?.length ?? 0) === 0
  );
}

function isTaskFullyResolved(item: PeriodicDueItem): boolean {
  const status = item.execution?.status;
  if (!status) return false;
  if (isDoneWithPendingPhoto(item)) return false;
  return true;
}

function getTaskStatusLabel(item: PeriodicDueItem): string | null {
  const status = item.execution?.status;
  if (!status) return null;
  if (isDoneWithPendingPhoto(item)) return DONE_PHOTO_PENDING_LABEL;
  return STATUS_LABELS[status] ?? status;
}

function countProgress(tasks: PeriodicDueItem[]) {
  const total = tasks.length;
  const resolved = tasks.filter(isTaskFullyResolved).length;
  return { total, resolved };
}

function isTaskPending(item: PeriodicDueItem): boolean {
  return !item.execution?.status;
}

function isBulkSelectable(item: PeriodicDueItem): boolean {
  return isTaskPending(item) && !hasTaskCustomFields(item.task.customFields);
}

function getFloorShortName(name: string, sortOrder: number): string {
  const match = name.match(/\b(PB|SS|S\d+|\d+)\b/i);
  if (match) return match[1].toUpperCase();
  return String(sortOrder);
}

function buildHierarchy(
  items: PeriodicDueItem[],
  floors: { id: string; name: string; sortOrder: number }[],
  zones: { id: string; name: string; floorId: string }[],
  subzones: { id: string; name: string; zoneId: string }[],
): FloorGroup[] {
  const floorMap = new Map<string, FloorGroup>();

  for (const floor of [...floors].sort((a, b) => a.sortOrder - b.sortOrder)) {
    floorMap.set(floor.id, {
      floorId: floor.id,
      floorName: floor.name,
      floorShort: getFloorShortName(floor.name, floor.sortOrder),
      zones: [],
      tasks: [],
    });
  }

  const zoneOrder = new Map<string, number>();
  zones.forEach((zone, index) => zoneOrder.set(zone.id, index + 1));

  for (const item of items) {
    const zone = zones.find((z) => z.id === item.task.zoneId);
    if (!zone) continue;

    let floorGroup = floorMap.get(zone.floorId);
    if (!floorGroup) {
      floorGroup = {
        floorId: zone.floorId,
        floorName: 'Planta',
        floorShort: '?',
        zones: [],
        tasks: [],
      };
      floorMap.set(zone.floorId, floorGroup);
    }

    floorGroup.tasks.push(item);

    let zoneGroup = floorGroup.zones.find((z) => z.zoneId === zone.id);
    if (!zoneGroup) {
      zoneGroup = {
        zoneId: zone.id,
        zoneName: zone.name,
        zoneIndex: floorGroup.zones.length + 1,
        subzones: [],
        tasks: [],
      };
      floorGroup.zones.push(zoneGroup);
    }

    zoneGroup.tasks.push(item);

    const subId = item.task.subzoneId ?? `zone-${zone.id}`;
    const sub = subzones.find((s) => s.id === item.task.subzoneId);
    const subName = sub?.name ?? 'General';

    let subGroup = zoneGroup.subzones.find((s) => s.subId === subId);
    if (!subGroup) {
      subGroup = { subId, subName, tasks: [] };
      zoneGroup.subzones.push(subGroup);
    }
    subGroup.tasks.push(item);
  }

  return Array.from(floorMap.values())
    .filter((f) => f.tasks.length > 0)
    .map((f) => ({ ...f }));
}

export default function TareasScreen() {
  const { selectedBuilding, prefetchData, refreshPrefetch } = useBuildingStore();
  const { isConnected } = useNetworkStatus();
  const isOnline = isConnected === true;
  const { setStatus } = useSyncStore();

  const [items, setItems] = useState<PeriodicDueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [uploadingPhotoForItemId, setUploadingPhotoForItemId] = useState<string | null>(null);
  const [isBulkMarking, setIsBulkMarking] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [reasonPickerItem, setReasonPickerItem] = useState<PeriodicDueItem | null>(null);
  const [fieldPickerItem, setFieldPickerItem] = useState<PeriodicDueItem | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedSubzoneId, setSelectedSubzoneId] = useState<string | null>(null);

  const buildingId = selectedBuilding?.id;
  const hasLoadedRef = useRef(false);

  const floors = prefetchData?.floors ?? [];
  const zones = prefetchData?.zones ?? [];
  const subzones = prefetchData?.subzones ?? [];

  useEffect(() => {
    hasLoadedRef.current = false;
    setItems([]);
    setIsLoading(true);
    setSelectedFloorId(null);
    setSelectedZoneId(null);
    setSelectedSubzoneId(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [buildingId]);

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const activeAttendance =
    prefetchData?.activeAttendance?.buildingId === selectedBuilding?.id
      ? prefetchData?.activeAttendance ?? null
      : null;

  const taskNotDoneReasons = (prefetchData?.rejectionReasons ?? []).filter(
    (r) => r.type === 'TASK_NOT_DONE',
  );

  const hierarchy = useMemo(
    () => buildHierarchy(items, floors, zones, subzones),
    [items, floors, zones, subzones],
  );

  useEffect(() => {
    if (hierarchy.length === 0) return;
    if (!selectedFloorId || !hierarchy.some((f) => f.floorId === selectedFloorId)) {
      setSelectedFloorId(hierarchy[0].floorId);
    }
  }, [hierarchy, selectedFloorId]);

  const selectedFloor = hierarchy.find((f) => f.floorId === selectedFloorId) ?? hierarchy[0];
  const selectedZone = selectedFloor?.zones.find((z) => z.zoneId === selectedZoneId) ?? null;
  const activeSubzone =
    selectedZone?.subzones.find((s) => s.subId === selectedSubzoneId) ??
    selectedZone?.subzones[0] ??
    null;

  useEffect(() => {
    setSelectedZoneId(null);
    setSelectedSubzoneId(null);
    clearSelection();
  }, [selectedFloorId, clearSelection]);

  useEffect(() => {
    if (!selectedZone) {
      setSelectedSubzoneId(null);
      return;
    }
    if (
      !selectedSubzoneId ||
      !selectedZone.subzones.some((s) => s.subId === selectedSubzoneId)
    ) {
      setSelectedSubzoneId(selectedZone.subzones[0]?.subId ?? null);
    }
  }, [selectedZone, selectedSubzoneId]);

  const loadDueToday = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
      if (!buildingId) return;
      if (mode === 'initial') setIsLoading(true);
      if (mode === 'refresh') setIsRefreshing(true);
      try {
        const data = await apiService.get<PeriodicDueItem[]>(
          `/tasks/due-today?buildingId=${buildingId}`,
        );
        setItems(Array.isArray(data) ? data : []);
      } catch (e) {
        if (mode !== 'silent') {
          Alert.alert('Error', e instanceof Error ? e.message : 'No se pudieron cargar las tareas');
        }
        if (mode === 'initial') setItems([]);
      } finally {
        if (mode === 'initial') setIsLoading(false);
        if (mode === 'refresh') setIsRefreshing(false);
      }
    },
    [buildingId],
  );

  useFocusEffect(
    useCallback(() => {
      if (!buildingId) return;
      const mode = hasLoadedRef.current ? 'silent' : 'initial';
      void loadDueToday(mode).finally(() => {
        hasLoadedRef.current = true;
      });
    }, [buildingId, loadDueToday]),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshPrefetch();
      await loadDueToday('silent');
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshPrefetch, loadDueToday]);

  const progress = useMemo(() => countProgress(items), [items]);

  async function reconcileItemMark(
    itemId: string,
    expectedStatus: 'DONE' | 'NOT_DONE',
  ): Promise<boolean> {
    if (!buildingId) return false;

    for (const delayMs of RECONCILE_DELAYS_MS) {
      if (delayMs > 0) await sleep(delayMs);
      try {
        const data = await apiService.get<PeriodicDueItem[]>(
          `/tasks/due-today?buildingId=${buildingId}`,
        );
        const list = Array.isArray(data) ? data : [];
        const item = list.find((i) => i.id === itemId);
        if (item?.execution?.status === expectedStatus) {
          setItems(list);
          return true;
        }
      } catch {
        // Reintentar: el servidor pudo haber guardado pero la respuesta se perdió.
      }
    }
    return false;
  }

  async function markItem(
    item: PeriodicDueItem,
    newStatus: 'DONE' | 'NOT_DONE',
    rejectionReasonId?: string,
    fieldValues?: TaskFieldValueInput[],
    options?: { silent?: boolean; skipReload?: boolean },
  ): Promise<boolean> {
    setMarkingId(item.id);
    try {
      const clientOperationId = generateClientId();
      const occurredAt = new Date().toISOString();
      const body = {
        status: newStatus,
        clientOperationId,
        ...(rejectionReasonId ? { rejectionReasonId } : {}),
        ...(fieldValues?.length ? { fieldValues } : {}),
      };

      if (isOnline) {
        await apiService.putOk(`/tasks/instances/${item.id}/mark`, body);
        if (!options?.skipReload) {
          try {
            await loadDueToday('silent');
          } catch {
            const reconciled = await reconcileItemMark(item.id, newStatus);
            if (!reconciled) {
              throw new Error('No se pudo confirmar la tarea. Revisá tu conexión e intentá de nuevo.');
            }
          }
        }
      } else {
        await syncQueue.enqueue({
          id: generateClientId(),
          clientOperationId,
          operationType: 'MARK_PERIODIC_TASK',
          entityType: 'PERIODIC_TASK_INSTANCE',
          entityId: item.id,
          payload: {
            periodicTaskInstanceId: item.id,
            status: newStatus,
            rejectionReasonId,
            fieldValues,
            deviceId: 'mobile',
          },
          occurredAt,
        });
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: 'COMPLETED',
                  execution: {
                    id: clientOperationId,
                    status: newStatus,
                    photos: i.execution?.photos ?? [],
                    fieldValues: fieldValues ?? i.execution?.fieldValues,
                  },
                }
              : i,
          ),
        );
        setStatus('pending');
      }
      return true;
    } catch (e) {
      if (isOnline && isNetworkError(e)) {
        const reconciled = await reconcileItemMark(item.id, newStatus);
        if (reconciled) return true;
      }
      if (!options?.silent) {
        Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo marcar la tarea');
      }
      return false;
    } finally {
      setMarkingId(null);
    }
  }

  function toggleSelectItem(item: PeriodicDueItem) {
    if (!isBulkSelectable(item)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  function selectAllPendingInSubzone(tasks: PeriodicDueItem[]) {
    setSelectedIds(new Set(tasks.filter(isBulkSelectable).map((t) => t.id)));
  }

  function deselectAllInSubzone() {
    setSelectedIds(new Set());
  }

  function requestMarkDone(item: PeriodicDueItem) {
    if ((item.task.customFields ?? []).length > 0) {
      setFieldPickerItem(item);
      return;
    }
    void markItem(item, 'DONE');
  }

  function handleConfirmFieldValues(values: TaskFieldValueInput[]) {
    if (!fieldPickerItem) return;
    const item = fieldPickerItem;
    setFieldPickerItem(null);
    void markItem(item, 'DONE', undefined, values);
  }

  async function markSelectedAsDone(tasks: PeriodicDueItem[]) {
    const toMark = tasks.filter((t) => selectedIds.has(t.id) && isBulkSelectable(t));
    if (toMark.length === 0) return;

    Alert.alert(
      'Marcar tareas',
      `¿Marcar ${toMark.length} tarea${toMark.length === 1 ? '' : 's'} como hecha${toMark.length === 1 ? '' : 's'}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setIsBulkMarking(true);
            let succeeded = 0;
            try {
              for (const item of toMark) {
                const ok = await markItem(item, 'DONE', undefined, {
                  silent: true,
                  skipReload: true,
                });
                if (ok) succeeded += 1;
              }
              if (isOnline) {
                try {
                  await loadDueToday('silent');
                } catch {
                  // El marcado pudo haberse aplicado en el servidor.
                }
              }
              clearSelection();
              if (succeeded < toMark.length) {
                Alert.alert(
                  'Marcado parcial',
                  `Se marcaron ${succeeded} de ${toMark.length} tareas. Revisá las pendientes e intentá de nuevo.`,
                );
              }
            } finally {
              setIsBulkMarking(false);
            }
          },
        },
      ],
    );
  }

  function handleMarkNotDone(item: PeriodicDueItem) {
    if (item.task.requiresRejectionReason) {
      if (taskNotDoneReasons.length === 0) {
        Alert.alert(
          'Sin motivos configurados',
          'Esta tarea requiere un motivo al marcarla como no realizada.',
        );
        return;
      }
      setReasonPickerItem(item);
      return;
    }
    markItem(item, 'NOT_DONE');
  }

  function handleSelectRejectionReason(reason: RejectionReason) {
    if (!reasonPickerItem) return;
    const item = reasonPickerItem;
    setReasonPickerItem(null);
    markItem(item, 'NOT_DONE', reason.id);
  }

  async function handlePhotoUpload(item: PeriodicDueItem): Promise<boolean> {
    const asset = await takeTaskPhoto();
    if (!asset) return false;

    setUploadingPhotoForItemId(item.id);
    try {
      let gpsLat: number | undefined;
      let gpsLng: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          gpsLat = loc.coords.latitude;
          gpsLng = loc.coords.longitude;
        }
      } catch {
        // GPS optional
      }

      const formData = new FormData();
      formData.append('photo', {
        uri: asset.uri,
        name: asset.fileName ?? `photo_${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
      formData.append('clientOperationId', generateClientId());
      formData.append('capturedAt', new Date().toISOString());
      if (gpsLat != null) formData.append('gpsLat', String(gpsLat));
      if (gpsLng != null) formData.append('gpsLng', String(gpsLng));

      await apiService.postMultipart(`/tasks/instances/${item.id}/photos`, formData);
      await loadDueToday('silent');
      return true;
    } catch (e) {
      Alert.alert('Error al subir foto', e instanceof Error ? e.message : 'Error desconocido');
      return false;
    } finally {
      setUploadingPhotoForItemId(null);
    }
  }

  const showLoading = isLoading && items.length === 0;

  return (
    <View style={styles.container}>
      <SyncStatusBar />

      <BrandedScreenHeader
        title="Tareas del día"
        subtitle={selectedBuilding?.name ?? undefined}
      />

      {!activeAttendance ? (
        <View style={styles.center}>
          <Ionicons name="time-outline" size={48} color={COLORS.disabled} />
          <Text style={styles.emptyTitle}>Fichá para ver tus tareas</Text>
          <Text style={styles.emptyText}>
            Las tareas periódicas aparecen cuando estás fichado en el edificio.
          </Text>
        </View>
      ) : showLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando tareas...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkbox-outline" size={48} color={COLORS.disabled} />
          <Text style={styles.emptyTitle}>Sin tareas para hoy</Text>
          <Text style={styles.emptyText}>No hay tareas periódicas pendientes para este día.</Text>
        </View>
      ) : (
        <>
          <View style={styles.progressBar}>
            <Text style={styles.progressText}>
              {progress.resolved} / {progress.total} completadas
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: progress.total
                      ? `${(progress.resolved / progress.total) * 100}%`
                      : '0%',
                  },
                ]}
              />
            </View>
          </View>

          <FloorChipStrip
            floors={hierarchy}
            selectedFloorId={selectedFloor?.floorId ?? null}
            onSelect={(floorId) => setSelectedFloorId(floorId)}
          />

          {selectedZone ? (
            <ZoneDetailView
              zone={selectedZone}
              activeSubzone={activeSubzone}
              selectedSubzoneId={selectedSubzoneId}
              markingId={markingId}
              uploadingPhotoForItemId={uploadingPhotoForItemId}
              isBulkMarking={isBulkMarking}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              isRefreshing={isRefreshing}
              onBack={() => {
                clearSelection();
                setSelectedZoneId(null);
              }}
              onSelectSubzone={(subId) => {
                clearSelection();
                setSelectedSubzoneId(subId);
              }}
              onRefresh={handleRefresh}
              onToggleSelectionMode={() => {
                if (selectionMode) clearSelection();
                else setSelectionMode(true);
              }}
              onToggleSelectItem={toggleSelectItem}
              onSelectAllPending={() =>
                selectAllPendingInSubzone(activeSubzone?.tasks ?? [])
              }
              onDeselectAll={deselectAllInSubzone}
              onBulkMarkDone={() => markSelectedAsDone(activeSubzone?.tasks ?? [])}
              onDone={(item) => {
                requestMarkDone(item);
              }}
              onNotDone={handleMarkNotDone}
              onAddPhoto={handlePhotoUpload}
            />
          ) : (
            <ZoneCardGrid
              zones={selectedFloor?.zones ?? []}
              isRefreshing={isRefreshing}
              onRefresh={handleRefresh}
              onSelectZone={(zoneId) => setSelectedZoneId(zoneId)}
            />
          )}
        </>
      )}

      <CustomFieldPickerModal
        visible={fieldPickerItem != null}
        taskName={fieldPickerItem?.task.name ?? ''}
        fields={fieldPickerItem?.task.customFields ?? []}
        initialValues={fieldPickerItem?.execution?.fieldValues}
        onCancel={() => setFieldPickerItem(null)}
        onConfirm={handleConfirmFieldValues}
      />

      <Modal visible={!!reasonPickerItem} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Motivo de no realización</Text>
            <FlatList
              data={taskNotDoneReasons}
              keyExtractor={(r) => r.id}
              renderItem={({ item: reason }) => (
                <TouchableOpacity
                  style={styles.reasonRow}
                  onPress={() => handleSelectRejectionReason(reason)}
                >
                  <Text style={styles.reasonText}>{reason.text}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setReasonPickerItem(null)}
            >
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FloorChipStrip({
  floors,
  selectedFloorId,
  onSelect,
}: {
  floors: FloorGroup[];
  selectedFloorId: string | null;
  onSelect: (floorId: string) => void;
}) {
  return (
    <View style={styles.floorStripWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.floorStrip}
      >
        {floors.map((floor) => {
          const { resolved, total } = countProgress(floor.tasks);
          const isActive = floor.floorId === selectedFloorId;
          const done = resolved === total && total > 0;

          return (
            <TouchableOpacity
              key={floor.floorId}
              style={[styles.floorChip, isActive && styles.floorChipActive]}
              onPress={() => onSelect(floor.floorId)}
            >
              <Text style={[styles.floorChipShort, isActive && styles.floorChipTextActive]}>
                {floor.floorShort}
              </Text>
              <Text
                style={[styles.floorChipProgress, isActive && styles.floorChipTextActive]}
                numberOfLines={1}
              >
                {resolved}/{total}
              </Text>
              {done && (
                <Ionicons
                  name="checkmark-circle"
                  size={12}
                  color={isActive ? '#fff' : COLORS.success}
                  style={styles.floorChipDone}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ZoneCardGrid({
  zones,
  isRefreshing,
  onRefresh,
  onSelectZone,
}: {
  zones: ZoneGroup[];
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectZone: (zoneId: string) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.zoneGrid}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.sectionTitle}>Zonas</Text>
      <View style={styles.zoneGridInner}>
        {zones.map((zone) => {
          const { resolved, total } = countProgress(zone.tasks);
          const pct = total ? resolved / total : 0;

          return (
            <TouchableOpacity
              key={zone.zoneId}
              style={styles.zoneCard}
              onPress={() => onSelectZone(zone.zoneId)}
              activeOpacity={0.85}
            >
              <View style={styles.zoneCardTop}>
                <View style={styles.zoneNumberBadge}>
                  <Text style={styles.zoneNumberText}>{zone.zoneIndex}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </View>
              <Text style={styles.zoneCardName} numberOfLines={2}>
                {zone.zoneName}
              </Text>
              <Text style={styles.zoneCardMeta}>
                {zone.subzones.length} subzonas · {resolved}/{total}
              </Text>
              <View style={styles.zoneCardTrack}>
                <View style={[styles.zoneCardFill, { width: `${pct * 100}%` }]} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

function ZoneDetailView({
  zone,
  activeSubzone,
  selectedSubzoneId,
  markingId,
  uploadingPhotoForItemId,
  isBulkMarking,
  selectionMode,
  selectedIds,
  isRefreshing,
  onBack,
  onSelectSubzone,
  onRefresh,
  onToggleSelectionMode,
  onToggleSelectItem,
  onSelectAllPending,
  onDeselectAll,
  onBulkMarkDone,
  onDone,
  onNotDone,
  onAddPhoto,
}: {
  zone: ZoneGroup;
  activeSubzone: SubzoneGroup | null;
  selectedSubzoneId: string | null;
  markingId: string | null;
  uploadingPhotoForItemId: string | null;
  isBulkMarking: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  isRefreshing: boolean;
  onBack: () => void;
  onSelectSubzone: (subId: string) => void;
  onRefresh: () => void;
  onToggleSelectionMode: () => void;
  onToggleSelectItem: (item: PeriodicDueItem) => void;
  onSelectAllPending: () => void;
  onDeselectAll: () => void;
  onBulkMarkDone: () => void;
  onDone: (item: PeriodicDueItem) => void;
  onNotDone: (item: PeriodicDueItem) => void;
  onAddPhoto: (item: PeriodicDueItem) => void;
}) {
  const zoneProgress = countProgress(zone.tasks);
  const subzoneTasks = activeSubzone?.tasks ?? [];
  const pendingInSubzone = subzoneTasks.filter(isTaskPending);
  const bulkSelectablePending = subzoneTasks.filter(isBulkSelectable);
  const selectedCount = bulkSelectablePending.filter((t) => selectedIds.has(t.id)).length;
  const allBulkSelectableSelected =
    bulkSelectablePending.length > 0 &&
    bulkSelectablePending.every((t) => selectedIds.has(t.id));

  return (
    <View style={styles.zoneDetail}>
      <View style={styles.zoneDetailHeader}>
        <View style={styles.zoneDetailHeaderTop}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
            <Text style={styles.backText}>Zonas</Text>
          </TouchableOpacity>
          {pendingInSubzone.length > 0 && (
            <TouchableOpacity
              style={styles.selectionToggleBtn}
              onPress={onToggleSelectionMode}
              disabled={isBulkMarking}
            >
              <Ionicons
                name={selectionMode ? 'close' : 'checkbox-outline'}
                size={16}
                color={COLORS.primary}
              />
              <Text style={styles.selectionToggleText}>
                {selectionMode ? 'Cancelar' : 'Seleccionar'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.zoneDetailTitleRow}>
          <View style={styles.zoneNumberBadgeLg}>
            <Text style={styles.zoneNumberTextLg}>{zone.zoneIndex}</Text>
          </View>
          <View style={styles.zoneDetailTitles}>
            <Text style={styles.zoneDetailName}>{zone.zoneName}</Text>
            <Text style={styles.zoneDetailMeta}>
              {zoneProgress.resolved}/{zoneProgress.total} tareas
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.subzoneTabsScroll}
        contentContainerStyle={styles.subzoneTabs}
      >
        {zone.subzones.map((sub) => {
          const { resolved, total } = countProgress(sub.tasks);
          const isActive = sub.subId === selectedSubzoneId;

          return (
            <TouchableOpacity
              key={sub.subId}
              style={[styles.subzoneTab, isActive && styles.subzoneTabActive]}
              onPress={() => onSelectSubzone(sub.subId)}
            >
              <Text
                style={[styles.subzoneTabText, isActive && styles.subzoneTabTextActive]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {sub.subName}
              </Text>
              <Text
                style={[styles.subzoneTabCount, isActive && styles.subzoneTabTextActive]}
                numberOfLines={1}
              >
                {resolved}/{total}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selectionMode && bulkSelectablePending.length > 0 && (
        <View style={styles.selectionToolbar}>
          <TouchableOpacity
            style={styles.selectAllBtn}
            onPress={() => {
              if (allBulkSelectableSelected) onDeselectAll();
              else onSelectAllPending();
            }}
          >
            <Ionicons
              name={allBulkSelectableSelected ? 'checkbox' : 'square-outline'}
              size={18}
              color={COLORS.primary}
            />
            <Text style={styles.selectAllText}>
              {allBulkSelectableSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.selectionCount}>
            {selectedCount} seleccionada{selectedCount === 1 ? '' : 's'}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.taskListScroll}
        contentContainerStyle={[
          styles.taskListContent,
          selectionMode && selectedCount > 0 && styles.taskListContentWithBar,
        ]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {subzoneTasks.map((item) => (
          <TaskRow
            key={item.id}
            item={item}
            isMarking={markingId === item.id || isBulkMarking}
            isMarkingThisItem={markingId === item.id}
            isUploadingPhoto={uploadingPhotoForItemId === item.id}
            selectionMode={selectionMode}
            isSelected={selectedIds.has(item.id)}
            onToggleSelect={() => onToggleSelectItem(item)}
            onDone={() => onDone(item)}
            onNotDone={() => onNotDone(item)}
            onAddPhoto={() => onAddPhoto(item)}
          />
        ))}

        {activeSubzone && activeSubzone.tasks.length === 0 && (
          <Text style={styles.emptySubzone}>Sin tareas en esta subzona</Text>
        )}
      </ScrollView>

      {selectionMode && selectedCount > 0 && (
        <View style={styles.bulkActionBar}>
          <TouchableOpacity
            style={[styles.bulkMarkBtn, isBulkMarking && styles.bulkMarkBtnDisabled]}
            onPress={onBulkMarkDone}
            disabled={isBulkMarking}
          >
            {isBulkMarking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={18} color="#fff" />
                <Text style={styles.bulkMarkBtnText}>
                  Marcar {selectedCount} como hecha{selectedCount === 1 ? '' : 's'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function TaskRow({
  item,
  isMarking,
  isMarkingThisItem,
  isUploadingPhoto,
  selectionMode,
  isSelected,
  onToggleSelect,
  onDone,
  onNotDone,
  onAddPhoto,
}: {
  item: PeriodicDueItem;
  isMarking: boolean;
  isMarkingThisItem: boolean;
  isUploadingPhoto: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDone: () => void;
  onNotDone: () => void;
  onAddPhoto: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const wasMarkingThisItem = useRef(false);
  const execStatus = item.execution?.status;
  const isResolved = !!execStatus;
  const isDone = execStatus === 'DONE';
  const isNotDone = execStatus === 'NOT_DONE';
  const canChangeNotDoneReason = isNotDone && item.task.requiresRejectionReason;
  const disableNotDoneBtn = isEditing && isNotDone && !canChangeNotDoneReason;
  const photoCount = item.execution?.photos?.length ?? 0;
  const needsPhoto = isDoneWithPendingPhoto(item);
  const statusLabel = getTaskStatusLabel(item);
  const showMarkActions = !isResolved || isEditing;
  const requiresIndividualCompletion =
    isTaskPending(item) && hasTaskCustomFields(item.task.customFields);
  const canSelect = selectionMode && isBulkSelectable(item);

  useEffect(() => {
    setIsEditing(false);
  }, [item.id, execStatus]);

  useEffect(() => {
    if (wasMarkingThisItem.current && !isMarkingThisItem) {
      setIsEditing(false);
    }
    wasMarkingThisItem.current = isMarkingThisItem;
  }, [isMarkingThisItem]);

  const rowContent = (
    <>
      {canSelect && (
        <TouchableOpacity
          style={styles.selectCheckbox}
          onPress={onToggleSelect}
          accessibilityLabel={isSelected ? 'Deseleccionar tarea' : 'Seleccionar tarea'}
        >
          <Ionicons
            name={isSelected ? 'checkbox' : 'square-outline'}
            size={22}
            color={isSelected ? COLORS.primary : COLORS.disabled}
          />
        </TouchableOpacity>
      )}
      <View style={styles.taskInfo}>
        <Ionicons
          name={
            needsPhoto
              ? 'camera-outline'
              : isDone
                ? 'checkmark-circle'
                : execStatus === 'NOT_DONE'
                  ? 'close-circle'
                  : 'ellipse-outline'
          }
          size={20}
          color={
            needsPhoto
              ? COLORS.warning
              : isDone
                ? COLORS.success
                : execStatus === 'NOT_DONE'
                  ? COLORS.error
                  : COLORS.disabled
          }
        />
        <View style={styles.taskTextWrap}>
          <View style={styles.taskNameRow}>
            <Text style={[styles.taskName, requiresIndividualCompletion && styles.taskNameWithHint]} numberOfLines={2}>
              {item.task.name}
            </Text>
            {requiresIndividualCompletion ? (
              <Text style={styles.individualHint}>Completar individualmente</Text>
            ) : null}
          </View>
          {statusLabel ? (
            <Text style={[styles.taskStatus, needsPhoto && styles.taskStatusPhotoPending]}>
              {statusLabel}
            </Text>
          ) : null}
          {isUploadingPhoto ? (
            <View style={styles.photoUploadingRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.photoUploadingText}>Subiendo foto...</Text>
            </View>
          ) : null}
        </View>
      </View>

      {!selectionMode && (
        <>
          {isMarking || isUploadingPhoto ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : showMarkActions ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btnDone, isEditing && isDone && styles.btnMarkCurrent]}
                onPress={onDone}
                disabled={isEditing && isDone}
              >
                <Text
                  style={[
                    styles.btnDoneText,
                    isEditing && isDone && styles.btnMarkCurrentText,
                  ]}
                >
                  Hecho
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnNotDone,
                  isEditing && isNotDone && !canChangeNotDoneReason && styles.btnMarkCurrentOutline,
                  isEditing && canChangeNotDoneReason && styles.btnNotDoneChangeReason,
                ]}
                onPress={onNotDone}
                disabled={disableNotDoneBtn}
              >
                <Text
                  style={[
                    styles.btnNotDoneText,
                    isEditing && isNotDone && !canChangeNotDoneReason && styles.btnMarkCurrentOutlineText,
                  ]}
                >
                  {isEditing && canChangeNotDoneReason ? 'Motivo' : 'No'}
                </Text>
              </TouchableOpacity>
              {isEditing && (
                <TouchableOpacity style={styles.btnEdit} onPress={() => setIsEditing(false)}>
                  <Ionicons name="close" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.actions}>
              {needsPhoto && (
                <TouchableOpacity
                  style={styles.btnPhoto}
                  onPress={onAddPhoto}
                  disabled={isUploadingPhoto}
                >
                  <Ionicons name="camera-outline" size={18} color={COLORS.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.btnEdit}
                onPress={() => setIsEditing(true)}
                accessibilityLabel="Corregir respuesta"
              >
                <Ionicons name="pencil-outline" size={18} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </>
  );

  if (canSelect) {
    return (
      <TouchableOpacity
        style={[styles.taskRow, isSelected && styles.taskRowSelected]}
        onPress={onToggleSelect}
        activeOpacity={0.85}
      >
        {rowContent}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[
        styles.taskRow,
        needsPhoto && styles.taskRowPhotoPending,
        requiresIndividualCompletion && selectionMode && styles.taskRowIndividual,
      ]}
    >
      {rowContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },
  progressBar: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  progressText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  progressTrack: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.success, borderRadius: 4 },
  floorStripWrap: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  floorStrip: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  floorChip: {
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    overflow: 'hidden',
  },
  floorChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  floorChipShort: { fontSize: 15, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  floorChipProgress: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  floorChipTextActive: { color: '#fff' },
  floorChipDone: { position: 'absolute', top: 3, right: 3 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  zoneGrid: { padding: 16, paddingBottom: 32 },
  zoneGridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  zoneCard: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  zoneCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  zoneNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  zoneNumberText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center',
    lineHeight: 14,
  },
  zoneCardName: { fontSize: 14, fontWeight: '700', color: COLORS.text, minHeight: 36 },
  zoneCardMeta: { fontSize: 11, color: COLORS.textMuted },
  zoneCardTrack: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  zoneCardFill: { height: '100%', backgroundColor: COLORS.success, borderRadius: 2 },
  zoneDetail: { flex: 1 },
  zoneDetailHeader: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  zoneDetailHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  selectionToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
  zoneDetailTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  zoneNumberBadgeLg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  zoneNumberTextLg: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center',
    lineHeight: 17,
  },
  zoneDetailTitles: { flex: 1, gap: 2 },
  zoneDetailName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  zoneDetailMeta: { fontSize: 12, color: COLORS.textMuted },
  subzoneTabsScroll: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexGrow: 0,
  },
  subzoneTabs: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  subzoneTab: {
    minWidth: 76,
    maxWidth: 120,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    overflow: 'hidden',
  },
  subzoneTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  subzoneTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    width: '100%',
  },
  subzoneTabCount: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  subzoneTabTextActive: { color: '#fff' },
  taskListScroll: { flex: 1 },
  taskListContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 32,
  },
  taskListContentWithBar: {
    paddingBottom: 88,
  },
  selectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#eff6ff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  selectionCount: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  bulkActionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 8,
  },
  bulkMarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.success,
    borderRadius: 10,
    paddingVertical: 14,
  },
  bulkMarkBtnDisabled: {
    opacity: 0.7,
  },
  bulkMarkBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  emptySubzone: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 13,
    paddingVertical: 24,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  taskRowSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#f0f7ff',
  },
  taskRowIndividual: {
    borderStyle: 'dashed',
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  taskRowPhotoPending: {
    borderColor: COLORS.warning,
    backgroundColor: '#fffbeb',
  },
  taskNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 4,
  },
  individualHint: {
    flex: 1,
    minWidth: 120,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.warning,
    lineHeight: 16,
  },
  selectCheckbox: {
    marginRight: 2,
  },
  taskInfo: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  taskTextWrap: { flex: 1, gap: 2 },
  taskName: { fontSize: 13, color: COLORS.text, flexShrink: 1 },
  taskNameWithHint: { flexShrink: 1, maxWidth: '58%' },
  taskStatus: { fontSize: 11, color: COLORS.textMuted },
  taskStatusPhotoPending: { color: COLORS.warning, fontWeight: '700' },
  photoWarning: { fontSize: 11, color: COLORS.warning, fontWeight: '600' },
  photoUploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  photoUploadingText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  btnDone: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnDoneText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  btnNotDone: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.error,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnNotDoneText: { color: COLORS.error, fontSize: 12, fontWeight: '700' },
  btnMarkCurrent: {
    backgroundColor: COLORS.border,
    opacity: 0.85,
  },
  btnMarkCurrentText: { color: COLORS.textMuted },
  btnMarkCurrentOutline: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    opacity: 0.85,
  },
  btnMarkCurrentOutlineText: { color: COLORS.textMuted },
  btnNotDoneChangeReason: {
    borderColor: COLORS.error,
    backgroundColor: '#fff5f5',
  },
  btnPhoto: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  btnEdit: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '60%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  reasonRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  reasonText: { fontSize: 14, color: COLORS.text },
  modalCancel: { marginTop: 12, alignItems: 'center', padding: 12 },
  modalCancelText: { fontSize: 14, color: COLORS.textMuted },
});
