import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Pressable,
  Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { calendarDateKeyInBusinessTz } from '@steam-genie/shared-constants';
import { AuthenticatedImage } from '../../src/components/AuthenticatedImage';
import { BrandedScreenHeader } from '../../src/components/BrandedScreenHeader';
import { COLORS } from '../../src/constants/colors';
import {
  adminApi,
  type AdminBuilding,
  type AdminUserItem,
  type AttendanceTimelineItem,
  type TimelineTaskRow,
} from '../../src/services/admin-api';

const DISPLAY_STATUS: Record<string, string> = {
  COMPLETED: 'Completada',
  NOT_DONE: 'No hecha',
  SKIPPED: 'Omitida',
  OVERDUE: 'Vencida',
  SCHEDULED: 'Programada',
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function formatBuildingAddress(building: AttendanceTimelineItem['building']): string | null {
  const parts = [building.address, building.city, building.province].filter(
    (part): part is string => Boolean(part?.trim()),
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

function openMaps(lat: number, lng: number) {
  void Linking.openURL(mapsUrl(lat, lng));
}

export default function AdminPresenciaScreen() {
  const [date, setDate] = useState(() => calendarDateKeyInBusinessTz(new Date()));
  const [buildings, setBuildings] = useState<AdminBuilding[]>([]);
  const [buildingId, setBuildingId] = useState<string>('');
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerOptions, setWorkerOptions] = useState<AdminUserItem[]>([]);
  const [workerId, setWorkerId] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [showBuildingPicker, setShowBuildingPicker] = useState(false);

  const [items, setItems] = useState<AttendanceTimelineItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tasksByKey, setTasksByKey] = useState<Record<string, TimelineTaskRow[]>>({});
  const [loadingTasksFor, setLoadingTasksFor] = useState<string | null>(null);

  const selectedBuildingName = useMemo(
    () => buildings.find((b) => b.id === buildingId)?.name,
    [buildings, buildingId],
  );

  useEffect(() => {
    void adminApi.listBuildings().then(setBuildings).catch(() => {});
  }, []);

  useEffect(() => {
    const q = workerSearch.trim();
    if (q.length < 2) {
      setWorkerOptions([]);
      return;
    }
    const t = setTimeout(() => {
      void adminApi
        .searchUsers(q)
        .then(setWorkerOptions)
        .catch(() => setWorkerOptions([]));
    }, 350);
    return () => clearTimeout(t);
  }, [workerSearch]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminApi.getTimeline({
        date,
        ...(buildingId ? { buildingId } : {}),
        ...(workerId ? { userId: workerId } : {}),
      });
      setItems(res.data);
      setTruncated(res.truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la presencia');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date, buildingId, workerId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  async function toggleExpand(item: AttendanceTimelineItem) {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    const key = `${item.building.id}|${date}`;
    if (tasksByKey[key]) return;
    setLoadingTasksFor(item.id);
    try {
      const tasks = await adminApi.getTimelineTasks(item.building.id, date);
      setTasksByKey((prev) => ({ ...prev, [key]: tasks }));
    } catch {
      setTasksByKey((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setLoadingTasksFor(null);
    }
  }

  function shiftDate(delta: number) {
    const [y, m, d] = date.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + delta));
    const pad = (n: number) => String(n).padStart(2, '0');
    setDate(
      `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`,
    );
  }

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <View style={styles.container}>
      <BrandedScreenHeader
        title="Presencia"
        subtitle="Fichadas y tareas del día"
      />

      <View style={styles.filters}>
        <View style={styles.dateNav}>
          <TouchableOpacity onPress={() => shiftDate(-1)} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
          <TouchableOpacity onPress={() => shiftDate(1)} hitSlop={10}>
            <Ionicons name="chevron-forward" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.filterChip}
          onPress={() => setShowBuildingPicker(true)}
        >
          <Ionicons name="business-outline" size={16} color={COLORS.primary} />
          <Text style={styles.filterChipText} numberOfLines={1}>
            {selectedBuildingName ?? 'Todos los edificios'}
          </Text>
        </TouchableOpacity>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar trabajador…"
            placeholderTextColor={COLORS.disabled}
            value={workerSearch}
            onChangeText={(t) => {
              setWorkerSearch(t);
              if (!t.trim()) {
                setWorkerId('');
                setWorkerName('');
              }
            }}
          />
          {workerId ? (
            <TouchableOpacity
              onPress={() => {
                setWorkerId('');
                setWorkerName('');
                setWorkerSearch('');
              }}
            >
              <Ionicons name="close-circle" size={18} color={COLORS.disabled} />
            </TouchableOpacity>
          ) : null}
        </View>
        {workerName ? (
          <Text style={styles.selectedWorker}>Filtrado: {workerName}</Text>
        ) : null}
        {workerOptions.length > 0 && !workerId ? (
          <View style={styles.suggestions}>
            {workerOptions.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={styles.suggestionRow}
                onPress={() => {
                  setWorkerId(u.id);
                  setWorkerName(u.fullName);
                  setWorkerSearch(u.fullName);
                  setWorkerOptions([]);
                }}
              >
                <Text style={styles.suggestionText}>
                  {u.fullName} · {u.dni}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setTasksByKey({});
                void load();
              }}
            />
          }
        >
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {truncated ? (
            <Text style={styles.hint}>Resultados truncados. Afiná los filtros.</Text>
          ) : null}

          {items.length === 0 ? (
            <Text style={styles.empty}>Sin fichadas para este día</Text>
          ) : (
            items.map((item) => {
              const key = `${item.building.id}|${date}`;
              const tasks = tasksByKey[key] ?? [];
              const expanded = expandedId === item.id;
              const progress = item.taskProgress;
              const buildingAddress = formatBuildingAddress(item.building);
              return (
                <View key={item.id} style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardTop}
                    onPress={() => void toggleExpand(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cardTitle}>{item.user.fullName}</Text>
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={COLORS.textMuted}
                    />
                  </TouchableOpacity>
                  <Text style={styles.meta}>{item.building.name}</Text>
                  {buildingAddress ? <Text style={styles.meta}>{buildingAddress}</Text> : null}
                  <Text style={styles.meta}>
                    Entrada {formatTime(item.checkInAt)}
                    {item.checkInOutOfRange ? ' (fuera de rango)' : ''}
                    {item.checkInDistanceM != null ? ` · ${item.checkInDistanceM} m` : ''}
                    {' · '}
                    Salida {formatTime(item.checkOutAt)}
                    {item.checkOutOutOfRange ? ' (fuera de rango)' : ''}
                    {item.checkOutDistanceM != null ? ` · ${item.checkOutDistanceM} m` : ''}
                  </Text>
                  {item.checkInGpsLat != null && item.checkInGpsLng != null ? (
                    <TouchableOpacity
                      onPress={() => openMaps(item.checkInGpsLat!, item.checkInGpsLng!)}
                      hitSlop={8}
                    >
                      <Text style={styles.mapLink}>
                        Ver entrada en mapa
                        {item.checkInDistanceM != null
                          ? ` · ${item.checkInDistanceM} m del edificio`
                          : ''}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.meta}>Entrada sin GPS</Text>
                  )}
                  {item.checkOutAt ? (
                    item.checkOutGpsLat != null && item.checkOutGpsLng != null ? (
                      <TouchableOpacity
                        onPress={() => openMaps(item.checkOutGpsLat!, item.checkOutGpsLng!)}
                        hitSlop={8}
                      >
                        <Text style={styles.mapLink}>
                          Ver salida en mapa
                          {item.checkOutDistanceM != null
                            ? ` · ${item.checkOutDistanceM} m del edificio`
                            : ''}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.meta}>Salida sin GPS</Text>
                    )
                  ) : null}
                  {progress ? (
                    <Text style={styles.meta}>
                      Tareas {progress.completed}/{progress.total}
                    </Text>
                  ) : null}

                  {expanded && (
                    <View style={styles.tasksBox}>
                      {loadingTasksFor === item.id ? (
                        <ActivityIndicator color={COLORS.primary} />
                      ) : tasks.length === 0 ? (
                        <Text style={styles.meta}>Sin tareas para este edificio</Text>
                      ) : (
                        tasks.map((task) => (
                          <View key={task.id} style={styles.taskRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.taskName}>{task.name}</Text>
                              <Text style={styles.meta}>
                                {DISPLAY_STATUS[task.displayStatus] ?? task.displayStatus}
                                {task.zone?.name ? ` · ${task.zone.name}` : ''}
                                {task.execution?.executedBy?.fullName
                                  ? ` · ${task.execution.executedBy.fullName}`
                                  : ''}
                              </Text>
                              {task.execution?.observation ? (
                                <Text style={styles.meta}>{task.execution.observation}</Text>
                              ) : null}
                            </View>
                            {(task.execution?.photos?.length ?? 0) > 0 && (
                              <ScrollView horizontal>
                                {task.execution!.photos!.map((photo) => (
                                  <AuthenticatedImage
                                    key={photo.id}
                                    pathOrUrl={photo.url}
                                    style={styles.thumb}
                                  />
                                ))}
                              </ScrollView>
                            )}
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={showBuildingPicker} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowBuildingPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edificio</Text>
              <TouchableOpacity onPress={() => setShowBuildingPicker(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => {
                  setBuildingId('');
                  setShowBuildingPicker(false);
                }}
              >
                <Ionicons
                  name={!buildingId ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={COLORS.primary}
                />
                <Text style={styles.checkLabel}>Todos</Text>
              </TouchableOpacity>
              {buildings.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={styles.checkRow}
                  onPress={() => {
                    setBuildingId(b.id);
                    setShowBuildingPicker(false);
                  }}
                >
                  <Ionicons
                    name={buildingId === b.id ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={COLORS.primary}
                  />
                  <Text style={styles.checkLabel}>{b.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  filters: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    textTransform: 'capitalize',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    maxWidth: '100%',
  },
  filterChipText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text, padding: 0 },
  selectedWorker: { fontSize: 12, color: COLORS.textMuted },
  suggestions: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: 160,
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  suggestionText: { fontSize: 13, color: COLORS.text },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  meta: { fontSize: 12, color: COLORS.textMuted },
  mapLink: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 2,
  },
  tasksBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  taskRow: {
    gap: 6,
    paddingVertical: 6,
  },
  taskName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 6,
    backgroundColor: COLORS.border,
  },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 40 },
  errorText: { color: COLORS.error },
  hint: { color: COLORS.warning, fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  checkLabel: { fontSize: 15, color: COLORS.text, flex: 1 },
});
