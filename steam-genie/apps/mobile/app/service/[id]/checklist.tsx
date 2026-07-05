import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { takeTaskPhoto } from '../../../src/utils/camera';
import * as Location from 'expo-location';
import { apiService } from '../../../src/services/api.service';
import { syncQueue, photoQueue, generateClientId } from '../../../src/sync/sync-queue';
import { syncManager } from '../../../src/sync/sync-manager';
import { useNetworkStatus } from '../../../src/hooks/useNetworkStatus';
import { useSyncStore } from '../../../src/stores/sync.store';
import { useBuildingStore, RejectionReason } from '../../../src/stores/building.store';
import { COLORS } from '../../../src/constants/colors';
import {
  ATTENDANCE_REQUIRED_MESSAGE,
  isCheckedInAtBuilding,
} from '../../../src/utils/attendance';
import {
  buildLocationHierarchy,
  LocationFloorGroup,
  LocationSubzoneGroup,
  LocationZoneGroup,
} from '../../../src/utils/location-hierarchy';
import { isNetworkError } from '../../../src/utils/network';
import { sleep } from '../../../src/utils/async';
import type { WorkOrderCached } from '../../../src/stores/building.store';
import {
  CustomFieldPickerModal,
  type TaskCustomField,
  type TaskFieldValueInput,
} from '../../../src/components/CustomFieldPickerModal';

const RECONCILE_DELAYS_MS = [0, 500, 1200, 2500] as const;

// ─── Types (aligned with backend TaskExecutionItem) ───────────────────────────

interface TaskPhotoSummary {
  id: string;
  url: string;
}

interface TaskExecutionDetail {
  id: string;
  status: string;
  observation: string | null;
  photos: TaskPhotoSummary[];
  fieldValues?: TaskFieldValueInput[];
}

interface TaskExecutionItem {
  workOrderTaskId: string;
  nameSnapshot: string;
  sortOrder: number;
  requiresPhotoSnapshot: boolean;
  allowsObservationSnapshot: boolean;
  requiresRejectionReasonSnapshot: boolean;
  zoneId: string | null;
  subzoneId: string | null;
  customFields: TaskCustomField[];
  execution: TaskExecutionDetail | null;
}

type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'NOT_DONE' | 'NA';

function getTaskStatus(task: TaskExecutionItem): TaskStatus {
  const status = task.execution?.status;
  if (!status) return 'NOT_STARTED';
  return status as TaskStatus;
}

function getTaskPhotos(task: TaskExecutionItem): TaskPhotoSummary[] {
  return task.execution?.photos ?? [];
}

function canMarkTask(task: TaskExecutionItem): boolean {
  const status = getTaskStatus(task);
  return status === 'NOT_STARTED' || status === 'IN_PROGRESS';
}

function isBulkSelectable(task: TaskExecutionItem): boolean {
  return canMarkTask(task) && task.customFields.length === 0;
}

function isTaskResolved(task: TaskExecutionItem): boolean {
  const status = getTaskStatus(task);
  if (status === 'NOT_STARTED' || status === 'IN_PROGRESS') return false;
  if (isDoneWithPendingPhoto(task)) return false;
  return true;
}

function isDoneWithPendingPhoto(task: TaskExecutionItem): boolean {
  return (
    getTaskStatus(task) === 'DONE' &&
    task.requiresPhotoSnapshot &&
    getTaskPhotos(task).length === 0
  );
}

function getTaskStatusLabel(task: TaskExecutionItem): string {
  const status = getTaskStatus(task);
  if (isDoneWithPendingPhoto(task)) return 'Realizada con foto pendiente';
  return STATUS_LABELS[status] ?? status;
}

function getTaskStatusIcon(task: TaskExecutionItem) {
  if (isDoneWithPendingPhoto(task)) {
    return { name: 'camera-outline' as const, color: COLORS.warning };
  }
  const status = getTaskStatus(task);
  return STATUS_ICONS[status] ?? STATUS_ICONS.NOT_STARTED;
}

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Sin iniciar',
  IN_PROGRESS: 'En progreso',
  DONE: 'Realizada',
  NOT_DONE: 'No realizada',
  NA: 'N/A',
};

const STATUS_ICONS: Record<string, { name: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string }> = {
  NOT_STARTED: { name: 'ellipse-outline', color: COLORS.disabled },
  IN_PROGRESS: { name: 'time-outline', color: COLORS.warning },
  DONE: { name: 'checkmark-circle', color: COLORS.success },
  NOT_DONE: { name: 'close-circle', color: COLORS.error },
  NA: { name: 'remove-circle-outline', color: COLORS.disabled },
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChecklistScreen() {
  const { id: workOrderId, seId } = useLocalSearchParams<{ id: string; seId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12);
  const { isConnected } = useNetworkStatus();
  const isOnline = isConnected === true;
  const { setStatus } = useSyncStore();
  const { prefetchData, refreshPrefetch, selectedBuilding } = useBuildingStore();

  const workOrderBuildingId =
    prefetchData?.workOrders.find((wo) => wo.id === workOrderId)?.buildingId ??
    selectedBuilding?.id;
  const canExecute = isCheckedInAtBuilding(
    prefetchData?.activeAttendance,
    workOrderBuildingId,
  );

  const taskNotDoneReasons = (prefetchData?.rejectionReasons ?? []).filter(
    (r) => r.type === 'TASK_NOT_DONE',
  );

  const [tasks, setTasks] = useState<TaskExecutionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [markingTaskId, setMarkingTaskId] = useState<string | null>(null);
  const [uploadingPhotoForWotId, setUploadingPhotoForWotId] = useState<string | null>(null);
  const [reasonPickerTask, setReasonPickerTask] = useState<TaskExecutionItem | null>(null);
  const [fieldPickerTask, setFieldPickerTask] = useState<TaskExecutionItem | null>(null);
  const [pendingMarkStatus, setPendingMarkStatus] = useState<'DONE' | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedSubzoneId, setSelectedSubzoneId] = useState<string | null>(null);
  const [isBulkMarking, setIsBulkMarking] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const prefetchForReasonsAttempted = useRef(false);

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const floors = prefetchData?.floors ?? [];
  const zones = prefetchData?.zones ?? [];
  const subzones = prefetchData?.subzones ?? [];

  const { hierarchy, unlocated } = useMemo(
    () => buildLocationHierarchy(tasks, floors, zones, subzones),
    [tasks, floors, zones, subzones],
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

  const loadTasks = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'initial'): Promise<TaskExecutionItem[] | null> => {
    if (!seId) {
      if (mode === 'initial') setIsLoading(false);
      return null;
    }
    if (mode === 'initial') setIsLoading(true);
    if (mode === 'refresh') setIsRefreshing(true);
    try {
      const data = await apiService.get<TaskExecutionItem[]>(`/service-executions/${seId}/tasks`);
      const items = Array.isArray(data) ? data : [];
      const cachedWo = useBuildingStore
        .getState()
        .prefetchData?.workOrders.find((wo) => wo.id === workOrderId);
      const mapped = items.map((item) => ({
        ...item,
        customFields: item.customFields ?? [],
        zoneId: item.zoneId ?? cachedWo?.zoneId ?? null,
        subzoneId: item.subzoneId ?? cachedWo?.subzoneId ?? null,
      }));
      setTasks(mapped);
      return mapped;
    } catch (e) {
      if (mode !== 'silent') {
        Alert.alert('Error', e instanceof Error ? e.message : 'No se pudieron cargar las tareas');
      }
      if (mode === 'initial') setTasks([]);
      return null;
    } finally {
      if (mode === 'initial') setIsLoading(false);
      if (mode === 'refresh') setIsRefreshing(false);
    }
  }, [seId, workOrderId]);

  useEffect(() => {
    prefetchForReasonsAttempted.current = false;
    if (!seId) {
      setIsLoading(false);
      return;
    }
    void loadTasks('initial');
  }, [seId, workOrderId, loadTasks]);

  useEffect(() => {
    const needsReasons = tasks.some((t) => t.requiresRejectionReasonSnapshot);
    if (
      !needsReasons ||
      taskNotDoneReasons.length > 0 ||
      prefetchForReasonsAttempted.current
    ) {
      return;
    }
    prefetchForReasonsAttempted.current = true;
    void refreshPrefetch();
  }, [tasks, taskNotDoneReasons.length, refreshPrefetch]);

  async function reconcileTaskMark(
    workOrderTaskId: string,
    expectedStatus: 'DONE' | 'NOT_DONE',
  ): Promise<boolean> {
    for (const delayMs of RECONCILE_DELAYS_MS) {
      if (delayMs > 0) await sleep(delayMs);
      const items = await loadTasks('silent');
      if (!items) continue;
      const task = items.find((t) => t.workOrderTaskId === workOrderTaskId);
      if (task?.execution?.status === expectedStatus) return true;
    }
    return false;
  }

  async function markTask(
    task: TaskExecutionItem,
    newStatus: 'DONE' | 'NOT_DONE',
    rejectionReasonId?: string,
    fieldValues?: TaskFieldValueInput[],
    options?: { silent?: boolean; skipReload?: boolean },
  ): Promise<boolean> {
    if (!seId) return false;
    if (!canExecute) {
      if (!options?.silent) {
        Alert.alert('Fichaje requerido', ATTENDANCE_REQUIRED_MESSAGE);
      }
      return false;
    }
    setMarkingTaskId(task.workOrderTaskId);
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
        await apiService.putOk(
          `/service-executions/${seId}/work-order-tasks/${task.workOrderTaskId}`,
          body,
        );
        if (!options?.skipReload) {
          try {
            await loadTasks('silent');
          } catch {
            const reconciled = await reconcileTaskMark(task.workOrderTaskId, newStatus);
            if (!reconciled) {
              throw new Error('No se pudo confirmar la tarea. Revisá tu conexión e intentá de nuevo.');
            }
          }
        }
      } else {
        await syncQueue.enqueue({
          id: generateClientId(),
          clientOperationId,
          operationType: 'MARK_WORK_ORDER_TASK',
          entityType: 'WORK_ORDER_TASK',
          entityId: task.workOrderTaskId,
          payload: {
            serviceExecutionId: seId,
            workOrderTaskId: task.workOrderTaskId,
            status: newStatus,
            rejectionReasonId,
            fieldValues,
            deviceId: 'mobile',
          },
          occurredAt,
        });
        setTasks((prev) =>
          prev.map((t) =>
            t.workOrderTaskId === task.workOrderTaskId
              ? {
                  ...t,
                  execution: {
                    id: clientOperationId,
                    status: newStatus,
                    observation: null,
                    photos: t.execution?.photos ?? [],
                    fieldValues: fieldValues ?? t.execution?.fieldValues,
                  },
                }
              : t,
          ),
        );
        setStatus('pending');
        await syncManager.refreshPendingCount();
      }
      return true;
    } catch (e) {
      if (isOnline && isNetworkError(e)) {
        const reconciled = await reconcileTaskMark(task.workOrderTaskId, newStatus);
        if (reconciled) return true;
      }
      if (!options?.silent) {
        Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo marcar la tarea');
      }
      return false;
    } finally {
      setMarkingTaskId(null);
    }
  }

  function toggleSelectTask(task: TaskExecutionItem) {
    if (!isBulkSelectable(task)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(task.workOrderTaskId)) next.delete(task.workOrderTaskId);
      else next.add(task.workOrderTaskId);
      return next;
    });
  }

  function selectAllPending(tasks: TaskExecutionItem[]) {
    setSelectedIds(new Set(tasks.filter(isBulkSelectable).map((t) => t.workOrderTaskId)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  async function markSelectedAsDone(tasks: TaskExecutionItem[]) {
    const toMark = tasks.filter((t) => selectedIds.has(t.workOrderTaskId) && isBulkSelectable(t));
    if (toMark.length === 0) return;

    Alert.alert(
      'Marcar tareas',
      `¿Marcar ${toMark.length} tarea${toMark.length === 1 ? '' : 's'} como realizada${toMark.length === 1 ? '' : 's'}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setIsBulkMarking(true);
            let succeeded = 0;
            try {
              for (const task of toMark) {
                const ok = await markTask(task, 'DONE', undefined, undefined, {
                  silent: true,
                  skipReload: true,
                });
                if (ok) succeeded += 1;
              }
              if (isOnline) {
                try {
                  await loadTasks('silent');
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

  function requestMarkDone(task: TaskExecutionItem) {
    if (task.customFields.length > 0) {
      setFieldPickerTask(task);
      setPendingMarkStatus('DONE');
      return;
    }
    void markTask(task, 'DONE');
  }

  function handleMarkNotDone(task: TaskExecutionItem) {
    if (task.requiresRejectionReasonSnapshot) {
      if (taskNotDoneReasons.length === 0) {
        Alert.alert(
          'Sin motivos configurados',
          'Esta tarea requiere un motivo al marcarla como no realizada. Volvé a seleccionar el edificio para actualizar datos o contactá al administrador.',
        );
        return;
      }
      setReasonPickerTask(task);
      return;
    }
    markTask(task, 'NOT_DONE');
  }

  function handleSelectRejectionReason(reason: RejectionReason) {
    if (!reasonPickerTask) return;
    const task = reasonPickerTask;
    setReasonPickerTask(null);
    void markTask(task, 'NOT_DONE', reason.id);
  }

  function handleConfirmFieldValues(values: TaskFieldValueInput[]) {
    if (!fieldPickerTask || pendingMarkStatus !== 'DONE') return;
    const task = fieldPickerTask;
    setFieldPickerTask(null);
    setPendingMarkStatus(null);
    void markTask(task, 'DONE', undefined, values);
  }

  function handleCancelFieldPicker() {
    setFieldPickerTask(null);
    setPendingMarkStatus(null);
  }

  async function uploadPhotoAsset(
    task: TaskExecutionItem,
    seIdParam: string,
    asset: NonNullable<Awaited<ReturnType<typeof takeTaskPhoto>>>,
  ): Promise<boolean> {
    try {
      let gpsLat: number | undefined;
      let gpsLng: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          gpsLat = loc.coords.latitude;
          gpsLng = loc.coords.longitude;
        }
      } catch {
        // GPS optional for photos
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

      await apiService.postMultipart(
        `/service-executions/${seIdParam}/work-order-tasks/${task.workOrderTaskId}/photos`,
        formData,
      );

      await loadTasks('silent');
      return true;
    } catch (e) {
      Alert.alert('Error al subir foto', e instanceof Error ? e.message : 'Error desconocido');
      return false;
    }
  }

  async function queuePhotoAsset(
    task: TaskExecutionItem,
    seIdParam: string,
    asset: NonNullable<Awaited<ReturnType<typeof takeTaskPhoto>>>,
  ) {
    const clientOperationId = generateClientId();

    let gpsLat: number | undefined;
    let gpsLng: number | undefined;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        gpsLat = loc.coords.latitude;
        gpsLng = loc.coords.longitude;
      }
    } catch {
      // GPS optional
    }

    await photoQueue.enqueue({
      id: generateClientId(),
      clientOperationId,
      serviceExecutionId: seIdParam,
      workOrderTaskId: task.workOrderTaskId,
      localUri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      capturedAt: new Date().toISOString(),
      gpsLat: gpsLat ?? null,
      gpsLng: gpsLng ?? null,
      deviceId: 'mobile',
    });

    setTasks((prev) =>
      prev.map((t) =>
        t.workOrderTaskId === task.workOrderTaskId
          ? {
              ...t,
              execution: {
                id: t.execution?.id ?? clientOperationId,
                status: t.execution?.status ?? 'DONE',
                observation: t.execution?.observation ?? null,
                photos: [{ id: clientOperationId, url: asset.uri }],
              },
            }
          : t,
      ),
    );
    setStatus('pending');
    await syncManager.refreshPendingCount();
  }

  async function addPhoto(task: TaskExecutionItem) {
    if (!seId) return;
    if (!canExecute) {
      Alert.alert('Fichaje requerido', ATTENDANCE_REQUIRED_MESSAGE);
      return;
    }

    const asset = await takeTaskPhoto();
    if (!asset) return;

    setUploadingPhotoForWotId(task.workOrderTaskId);
    try {
      if (isOnline) {
        await uploadPhotoAsset(task, seId, asset);
      } else {
        await queuePhotoAsset(task, seId, asset);
      }
    } finally {
      setUploadingPhotoForWotId(null);
    }
  }

  const sortedTasks = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  const resolvedCount = tasks.filter(isTaskResolved).length;
  const totalCount = tasks.length;
  const allResolved = totalCount > 0 && resolvedCount === totalCount;
  const progress = totalCount > 0 ? resolvedCount / totalCount : 0;
  const useHierarchy = hierarchy.length > 0;

  function renderTaskCard(task: TaskExecutionItem) {
    return (
      <TaskCard
        key={task.workOrderTaskId}
        task={task}
        canExecute={canExecute}
        isMarking={markingTaskId === task.workOrderTaskId || isBulkMarking}
        isUploadingPhoto={uploadingPhotoForWotId === task.workOrderTaskId}
        selectionMode={selectionMode}
        isSelected={selectedIds.has(task.workOrderTaskId)}
        onToggleSelect={() => toggleSelectTask(task)}
        onMarkDone={() => requestMarkDone(task)}
        onMarkNotDone={() => handleMarkNotDone(task)}
        onAddPhoto={() => addPhoto(task)}
      />
    );
  }

  function renderFinishButton() {
    return (
      <TouchableOpacity
        style={[styles.finishBtn, { marginBottom: bottomPad }]}
        onPress={() => router.back()}
      >
        <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
        <Text style={styles.finishBtnText}>Checklist listo — volver al servicio</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checklist</Text>
        {!isOnline && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineBadgeText}>Modo sin conexión</Text>
          </View>
        )}
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {resolvedCount} / {totalCount} tareas resueltas
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : tasks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="list-outline" size={48} color={COLORS.disabled} />
          <Text style={styles.emptyText}>No hay tareas en este checklist</Text>
        </View>
      ) : useHierarchy ? (
        <View style={styles.hierarchyBody}>
          {!canExecute ? (
            <View style={styles.attendanceNotice}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.warning} />
              <Text style={styles.attendanceNoticeText}>{ATTENDANCE_REQUIRED_MESSAGE}</Text>
            </View>
          ) : null}

          <ChecklistFloorStrip
            floors={hierarchy}
            selectedFloorId={selectedFloor?.floorId ?? null}
            onSelect={setSelectedFloorId}
          />

          {selectedZone ? (
            <ChecklistZoneDetail
              zone={selectedZone}
              activeSubzone={activeSubzone}
              selectedSubzoneId={selectedSubzoneId}
              isRefreshing={isRefreshing}
              isBulkMarking={isBulkMarking}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              canExecute={canExecute}
              bottomPad={bottomPad}
              onBack={() => {
                clearSelection();
                setSelectedZoneId(null);
              }}
              onSelectSubzone={(subId) => {
                clearSelection();
                setSelectedSubzoneId(subId);
              }}
              onRefresh={() => loadTasks('refresh')}
              onToggleSelectionMode={() => {
                if (selectionMode) clearSelection();
                else setSelectionMode(true);
              }}
              onSelectAllPending={() => selectAllPending(activeSubzone?.items ?? [])}
              onDeselectAll={deselectAll}
              onBulkMarkDone={() => markSelectedAsDone(activeSubzone?.items ?? [])}
              renderTask={renderTaskCard}
            />
          ) : (
            <ScrollView
              contentContainerStyle={[styles.zoneGrid, { paddingBottom: 24 + bottomPad }]}
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={() => loadTasks('refresh')} />
              }
            >
              <Text style={styles.sectionTitle}>Zonas</Text>
              <View style={styles.zoneGridInner}>
                {(selectedFloor?.zones ?? []).map((zone) => {
                  const resolved = zone.items.filter(isTaskResolved).length;
                  const total = zone.items.length;
                  const pct = total ? resolved / total : 0;
                  return (
                    <TouchableOpacity
                      key={zone.zoneId}
                      style={styles.zoneCard}
                      onPress={() => setSelectedZoneId(zone.zoneId)}
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
          )}

          {unlocated.length > 0 && !selectedZoneId ? (
            <ChecklistBulkTaskSection
              tasks={unlocated}
              canExecute={canExecute}
              isRefreshing={isRefreshing}
              isBulkMarking={isBulkMarking}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              bottomPad={bottomPad}
              sectionTitle="Sin ubicación"
              stickyBulkBar={false}
              onRefresh={() => loadTasks('refresh')}
              onToggleSelectionMode={() => {
                if (selectionMode) clearSelection();
                else setSelectionMode(true);
              }}
              onSelectAllPending={() => selectAllPending(unlocated)}
              onDeselectAll={deselectAll}
              onBulkMarkDone={() => markSelectedAsDone(unlocated)}
              renderTask={renderTaskCard}
            />
          ) : null}

          {allResolved ? renderFinishButton() : null}
        </View>
      ) : (
        <ChecklistBulkTaskSection
          tasks={sortedTasks}
          canExecute={canExecute}
          isRefreshing={isRefreshing}
          isBulkMarking={isBulkMarking}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          bottomPad={bottomPad}
          onRefresh={() => loadTasks('refresh')}
          onToggleSelectionMode={() => {
            if (selectionMode) clearSelection();
            else setSelectionMode(true);
          }}
          onSelectAllPending={() => selectAllPending(sortedTasks)}
          onDeselectAll={deselectAll}
          onBulkMarkDone={() => markSelectedAsDone(sortedTasks)}
          renderTask={renderTaskCard}
          footer={allResolved ? renderFinishButton() : null}
        />
      )}

      <CustomFieldPickerModal
        visible={fieldPickerTask != null}
        taskName={fieldPickerTask?.nameSnapshot ?? ''}
        fields={fieldPickerTask?.customFields ?? []}
        initialValues={fieldPickerTask?.execution?.fieldValues}
        onCancel={handleCancelFieldPicker}
        onConfirm={handleConfirmFieldValues}
      />

      <Modal
        visible={reasonPickerTask != null}
        transparent
        animationType="slide"
        onRequestClose={() => setReasonPickerTask(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: 20 + bottomPad }]}>
            <Text style={styles.modalTitle}>Motivo de no realización</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {reasonPickerTask?.nameSnapshot}
            </Text>
            <FlatList
              data={taskNotDoneReasons}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.reasonRow}
                  onPress={() => handleSelectRejectionReason(item)}
                >
                  <Text style={styles.reasonText}>{item.text}</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.modalEmpty}>No hay motivos disponibles</Text>
              }
            />
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setReasonPickerTask(null)}
            >
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface TaskCardProps {
  task: TaskExecutionItem;
  canExecute: boolean;
  isMarking: boolean;
  isUploadingPhoto: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onMarkDone: () => void;
  onMarkNotDone: () => void;
  onAddPhoto: () => void;
}

function countTaskProgress(items: TaskExecutionItem[]) {
  return {
    total: items.length,
    resolved: items.filter(isTaskResolved).length,
  };
}

function ChecklistFloorStrip({
  floors,
  selectedFloorId,
  onSelect,
}: {
  floors: LocationFloorGroup<TaskExecutionItem>[];
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
          const { resolved, total } = countTaskProgress(floor.items);
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
              <Text style={[styles.floorChipProgress, isActive && styles.floorChipTextActive]}>
                {resolved}/{total}
              </Text>
              {done ? (
                <Ionicons
                  name="checkmark-circle"
                  size={12}
                  color={isActive ? '#fff' : COLORS.success}
                  style={styles.floorChipDone}
                />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ChecklistBulkTaskSection({
  tasks,
  canExecute,
  isRefreshing,
  isBulkMarking,
  selectionMode,
  selectedIds,
  bottomPad,
  sectionTitle,
  onRefresh,
  onToggleSelectionMode,
  onSelectAllPending,
  onDeselectAll,
  onBulkMarkDone,
  renderTask,
  footer,
  stickyBulkBar = true,
}: {
  tasks: TaskExecutionItem[];
  canExecute: boolean;
  isRefreshing: boolean;
  isBulkMarking: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  bottomPad: number;
  sectionTitle?: string;
  onRefresh: () => void;
  onToggleSelectionMode: () => void;
  onSelectAllPending: () => void;
  onDeselectAll: () => void;
  onBulkMarkDone: () => void;
  renderTask: (task: TaskExecutionItem) => ReactNode;
  footer?: ReactNode;
  stickyBulkBar?: boolean;
}) {
  const bulkSelectablePending = tasks.filter(isBulkSelectable);
  const selectedCount = bulkSelectablePending.filter((t) => selectedIds.has(t.workOrderTaskId)).length;
  const allBulkSelectableSelected =
    bulkSelectablePending.length > 0 &&
    bulkSelectablePending.every((t) => selectedIds.has(t.workOrderTaskId));
  const showSelectionToggle = canExecute && bulkSelectablePending.length > 0;

  return (
    <View style={stickyBulkBar ? styles.bulkTaskSection : undefined}>
      {!canExecute ? (
        <View style={styles.attendanceNotice}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.warning} />
          <Text style={styles.attendanceNoticeText}>{ATTENDANCE_REQUIRED_MESSAGE}</Text>
        </View>
      ) : null}

      {showSelectionToggle ? (
        <View style={styles.flatSelectionHeader}>
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
        </View>
      ) : null}

      {selectionMode && bulkSelectablePending.length > 0 ? (
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
      ) : null}

      <ScrollView
        style={stickyBulkBar ? styles.taskListScroll : undefined}
        contentContainerStyle={[
          sectionTitle ? styles.unlocatedSection : styles.content,
          {
            paddingBottom:
              (sectionTitle ? 16 : 40) +
              bottomPad +
              (!stickyBulkBar && selectionMode && selectedCount > 0 ? 72 : 0),
          },
          stickyBulkBar && selectionMode && selectedCount > 0 && styles.taskListContentWithBar,
        ]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {sectionTitle ? <Text style={styles.sectionTitle}>{sectionTitle}</Text> : null}
        {tasks.map((task) => renderTask(task))}
        {!stickyBulkBar && selectionMode && selectedCount > 0 ? (
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
                  Marcar {selectedCount} como realizada{selectedCount === 1 ? '' : 's'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
        {footer}
      </ScrollView>

      {stickyBulkBar && selectionMode && selectedCount > 0 ? (
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
                  Marcar {selectedCount} como realizada{selectedCount === 1 ? '' : 's'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function ChecklistZoneDetail({
  zone,
  activeSubzone,
  selectedSubzoneId,
  isRefreshing,
  isBulkMarking,
  selectionMode,
  selectedIds,
  canExecute,
  bottomPad,
  onBack,
  onSelectSubzone,
  onRefresh,
  onToggleSelectionMode,
  onSelectAllPending,
  onDeselectAll,
  onBulkMarkDone,
  renderTask,
}: {
  zone: LocationZoneGroup<TaskExecutionItem>;
  activeSubzone: LocationSubzoneGroup<TaskExecutionItem> | null;
  selectedSubzoneId: string | null;
  isRefreshing: boolean;
  isBulkMarking: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  canExecute: boolean;
  bottomPad: number;
  onBack: () => void;
  onSelectSubzone: (subId: string) => void;
  onRefresh: () => void;
  onToggleSelectionMode: () => void;
  onSelectAllPending: () => void;
  onDeselectAll: () => void;
  onBulkMarkDone: () => void;
  renderTask: (task: TaskExecutionItem) => ReactNode;
}) {
  const { resolved, total } = countTaskProgress(zone.items);
  const subzoneTasks = activeSubzone?.items ?? [];
  const pendingInSubzone = subzoneTasks.filter(canMarkTask);
  const bulkSelectablePending = subzoneTasks.filter(isBulkSelectable);
  const selectedCount = bulkSelectablePending.filter((t) => selectedIds.has(t.workOrderTaskId)).length;
  const allBulkSelectableSelected =
    bulkSelectablePending.length > 0 &&
    bulkSelectablePending.every((t) => selectedIds.has(t.workOrderTaskId));

  return (
    <View style={styles.zoneDetail}>
      <View style={styles.zoneDetailHeader}>
        <View style={styles.zoneDetailHeaderTop}>
          <TouchableOpacity style={styles.zoneBackBtn} onPress={onBack}>
            <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
            <Text style={styles.zoneBackText}>Zonas</Text>
          </TouchableOpacity>
          {canExecute && pendingInSubzone.length > 0 ? (
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
          ) : null}
        </View>
        <View style={styles.zoneDetailTitleRow}>
          <View style={styles.zoneNumberBadgeLg}>
            <Text style={styles.zoneNumberTextLg}>{zone.zoneIndex}</Text>
          </View>
          <View style={styles.zoneDetailTitles}>
            <Text style={styles.zoneDetailName}>{zone.zoneName}</Text>
            <Text style={styles.zoneDetailMeta}>
              {resolved}/{total} completadas · {zone.subzones.length} subzonas
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
          const subProgress = countTaskProgress(sub.items);
          const isActive = sub.subId === selectedSubzoneId;
          return (
            <TouchableOpacity
              key={sub.subId}
              style={[styles.subzoneTab, isActive && styles.subzoneTabActive]}
              onPress={() => onSelectSubzone(sub.subId)}
            >
              <Text
                style={[styles.subzoneTabText, isActive && styles.subzoneTabTextActive]}
                numberOfLines={2}
              >
                {sub.subName}
              </Text>
              <Text style={[styles.subzoneTabCount, isActive && styles.subzoneTabTextActive]}>
                {subProgress.resolved}/{subProgress.total}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selectionMode && bulkSelectablePending.length > 0 ? (
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
      ) : null}

      <ScrollView
        style={styles.taskListScroll}
        contentContainerStyle={[
          styles.taskListContent,
          { paddingBottom: 32 + bottomPad },
          selectionMode && selectedCount > 0 && styles.taskListContentWithBar,
        ]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {activeSubzone?.items.length ? (
          activeSubzone.items.map((task) => renderTask(task))
        ) : (
          <Text style={styles.emptySubzone}>Sin tareas en esta subzona</Text>
        )}
      </ScrollView>

      {selectionMode && selectedCount > 0 ? (
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
                  Marcar {selectedCount} como realizada{selectedCount === 1 ? '' : 's'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function TaskCard({
  task,
  canExecute,
  isMarking,
  isUploadingPhoto,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onMarkDone,
  onMarkNotDone,
  onAddPhoto,
}: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const wasMarking = useRef(false);
  const status = getTaskStatus(task);
  const photos = getTaskPhotos(task);
  const iconConfig = getTaskStatusIcon(task);
  const statusLabel = getTaskStatusLabel(task);
  const isDone = status === 'DONE';
  const isNotDone = status === 'NOT_DONE';
  const isResolved = isTaskResolved(task);
  const canChangeNotDoneReason = isNotDone && task.requiresRejectionReasonSnapshot;
  const disableNotDoneBtn = isEditing && isNotDone && !canChangeNotDoneReason;
  const needsPhoto = isDoneWithPendingPhoto(task);
  const showMarkActions = canExecute && (canMarkTask(task) || isEditing) && !selectionMode;
  const requiresIndividualCompletion =
    canMarkTask(task) && task.customFields.length > 0;
  const canSelect = selectionMode && isBulkSelectable(task);

  useEffect(() => {
    setIsEditing(false);
  }, [task.workOrderTaskId, status]);

  useEffect(() => {
    if (wasMarking.current && !isMarking) {
      setIsEditing(false);
    }
    wasMarking.current = isMarking;
  }, [isMarking]);

  const cardContent = (
    <>
      <View style={styles.taskHeader}>
        {canSelect ? (
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
        ) : null}
        <Ionicons name={iconConfig.name} size={22} color={iconConfig.color} />
        <View style={styles.taskInfo}>
          <Text style={styles.taskName}>{task.nameSnapshot}</Text>
          {requiresIndividualCompletion && selectionMode ? (
            <Text style={styles.individualHint}>Completar individualmente</Text>
          ) : null}
          <Text
            style={[
              styles.taskStatus,
              { color: iconConfig.color },
              needsPhoto && styles.taskStatusPhotoPending,
            ]}
          >
            {statusLabel}
          </Text>
        </View>
        {task.requiresPhotoSnapshot && (
          <Ionicons name="camera-outline" size={16} color={COLORS.primary} />
        )}
        {task.requiresRejectionReasonSnapshot && (
          <Ionicons name="help-circle-outline" size={16} color={COLORS.warning} />
        )}
        {isResolved && !isEditing && canExecute && !selectionMode && (
          <TouchableOpacity
            style={styles.editIconBtn}
            onPress={() => setIsEditing(true)}
            accessibilityLabel="Corregir respuesta"
          >
            <Ionicons name="pencil-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        )}
      </View>

      {photos.length > 0 && (
        <ScrollView horizontal style={styles.photoRow} showsHorizontalScrollIndicator={false}>
          {photos.map((photo) => (
            <Image key={photo.id} source={{ uri: photo.url }} style={styles.photoThumb} />
          ))}
        </ScrollView>
      )}

      {isUploadingPhoto ? (
        <View style={styles.photoUploading}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.photoUploadingText}>Subiendo foto...</Text>
        </View>
      ) : null}

      {isMarking ? (
        <ActivityIndicator color={COLORS.primary} style={styles.taskLoader} />
      ) : isUploadingPhoto ? (
        <View style={styles.photoUploadingActions}>
          <ActivityIndicator color={COLORS.primary} size="small" />
          <Text style={styles.photoUploadingText}>Subiendo foto...</Text>
        </View>
      ) : (
        <View style={styles.taskActions}>
          {showMarkActions && (
            <View style={styles.taskActionRow}>
              <TouchableOpacity
                style={[
                  styles.taskBtn,
                  styles.taskBtnDone,
                  isEditing && isDone && styles.taskBtnCurrent,
                ]}
                onPress={onMarkDone}
                disabled={isEditing && isDone}
              >
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={isEditing && isDone ? COLORS.textMuted : '#fff'}
                />
                <Text
                  style={[
                    styles.taskBtnText,
                    isEditing && isDone && styles.taskBtnCurrentText,
                  ]}
                >
                  Realizada
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.taskBtn,
                  styles.taskBtnNotDone,
                  isEditing && isNotDone && !canChangeNotDoneReason && styles.taskBtnCurrent,
                  isEditing && canChangeNotDoneReason && styles.taskBtnNotDoneChangeReason,
                ]}
                onPress={onMarkNotDone}
                disabled={disableNotDoneBtn}
              >
                <Ionicons
                  name="close"
                  size={16}
                  color={
                    isEditing && isNotDone && !canChangeNotDoneReason
                      ? COLORS.textMuted
                      : '#fff'
                  }
                />
                <Text
                  style={[
                    styles.taskBtnText,
                    isEditing && isNotDone && !canChangeNotDoneReason && styles.taskBtnCurrentText,
                  ]}
                >
                  {isEditing && canChangeNotDoneReason ? 'Cambiar motivo' : 'No realizada'}
                </Text>
              </TouchableOpacity>
              {isEditing && (
                <TouchableOpacity style={styles.editCancelBtn} onPress={() => setIsEditing(false)}>
                  <Ionicons name="close-circle-outline" size={22} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          )}
          {isDone && canExecute && !selectionMode && (
            <TouchableOpacity style={[styles.taskBtn, styles.taskBtnPhoto]} onPress={onAddPhoto}>
              <Ionicons name="camera-outline" size={16} color={COLORS.primary} />
              <Text style={[styles.taskBtnText, { color: COLORS.primary }]}>Foto</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </>
  );

  if (canSelect) {
    return (
      <TouchableOpacity
        style={[styles.taskCard, isSelected && styles.taskCardSelected]}
        onPress={onToggleSelect}
        activeOpacity={0.85}
      >
        {cardContent}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[
        styles.taskCard,
        needsPhoto && styles.taskCardPhotoPending,
        isDone && !needsPhoto && styles.taskCardDone,
        isNotDone && styles.taskCardNotDone,
        requiresIndividualCompletion && selectionMode && styles.taskCardIndividual,
      ]}
    >
      {cardContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 20, paddingTop: 60, backgroundColor: COLORS.primary, gap: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  backText: { color: '#fff', fontSize: 14, marginLeft: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  offlineBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.warning,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 4,
  },
  offlineBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  progressContainer: {
    backgroundColor: COLORS.surface,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 6,
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.success, borderRadius: 3 },
  progressText: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hierarchyBody: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  empty: { flex: 1, padding: 48, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  floorStripWrap: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  floorStrip: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  floorChip: {
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: 2,
  },
  floorChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  floorChipShort: { fontSize: 15, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  floorChipProgress: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
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
  zoneGrid: { padding: 16, paddingBottom: 24 },
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
  zoneCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  zoneNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneNumberText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
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
  flatSelectionHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  bulkTaskSection: { flex: 1 },
  zoneBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  zoneBackText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
  zoneDetailTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  zoneNumberBadgeLg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneNumberTextLg: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
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
    gap: 3,
  },
  subzoneTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
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
  taskListContent: { padding: 16, gap: 10, paddingBottom: 32 },
  taskListContentWithBar: { paddingBottom: 88 },
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
  bulkMarkBtnDisabled: { opacity: 0.7 },
  bulkMarkBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptySubzone: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 13,
    paddingVertical: 24,
  },
  unlocatedSection: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  taskCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    gap: 8,
  },
  taskCardDone: { borderLeftWidth: 3, borderLeftColor: COLORS.success },
  taskCardPhotoPending: { borderLeftWidth: 3, borderLeftColor: COLORS.warning, backgroundColor: '#fffbeb' },
  taskCardNotDone: { borderLeftWidth: 3, borderLeftColor: COLORS.error },
  taskCardSelected: { borderColor: COLORS.primary, backgroundColor: '#f0f7ff' },
  taskCardIndividual: { borderStyle: 'dashed', backgroundColor: '#fffbeb' },
  taskHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  taskInfo: { flex: 1 },
  taskName: { fontSize: 14, fontWeight: '600', color: COLORS.text, lineHeight: 20 },
  individualHint: { fontSize: 11, color: COLORS.warning, fontWeight: '600', marginTop: 2 },
  taskStatus: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  taskStatusPhotoPending: { fontWeight: '700' },
  photoRow: { marginTop: 4 },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 6,
    marginRight: 8,
    backgroundColor: COLORS.border,
  },
  photoWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fffbeb',
    borderRadius: 6,
    padding: 8,
  },
  photoWarningText: { fontSize: 12, color: COLORS.warning, fontWeight: '500' },
  photoUploading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    padding: 8,
  },
  photoUploadingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  photoUploadingText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  taskActions: { gap: 8 },
  taskActionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  editIconBtn: { padding: 4, marginLeft: 4 },
  selectCheckbox: { padding: 2, marginTop: 1 },
  editCancelBtn: { padding: 4, justifyContent: 'center' },
  taskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  taskBtnDone: { backgroundColor: COLORS.success },
  taskBtnNotDone: { backgroundColor: COLORS.error },
  taskBtnPhoto: { borderWidth: 1, borderColor: COLORS.primary, backgroundColor: '#eff6ff' },
  taskBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  taskBtnCurrent: { backgroundColor: COLORS.border },
  taskBtnCurrentText: { color: COLORS.textMuted },
  taskBtnNotDoneChangeReason: { backgroundColor: '#dc2626' },
  taskLoader: { alignSelf: 'center', padding: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '70%',
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalSubtitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  reasonText: { flex: 1, fontSize: 15, color: COLORS.text, paddingRight: 8 },
  modalEmpty: { textAlign: 'center', color: COLORS.textMuted, padding: 24 },
  modalCancelBtn: {
    marginTop: 12,
    padding: 14,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.bg,
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: COLORS.textMuted },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: COLORS.success,
  },
  finishBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  attendanceNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 12,
    margin: 16,
    marginBottom: 0,
  },
  attendanceNoticeText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },
});
