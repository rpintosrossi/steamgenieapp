import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/stores/auth.store';
import { useBuildingStore, Building, WorkOrderCached } from '../src/stores/building.store';
import { apiService } from '../src/services/api.service';
import { COLORS } from '../src/constants/colors';
import { BrandLogo } from '../src/components/BrandLogo';
import { BrandedScreenHeader } from '../src/components/BrandedScreenHeader';
import {
  getUserAssignment,
  isWorkOrderExpired,
  normalizeWorkOrdersList,
} from '../src/utils/work-orders';

interface BuildingsResponse {
  data?: Building[];
  total?: number;
}

function normalizeBuildingsList(response: unknown): Building[] {
  if (!response || typeof response !== 'object') return [];
  const payload = response as BuildingsResponse | Building[];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.data) ? payload.data : [];
}

interface AttendanceTodaySummary {
  active: {
    buildingId: string;
    checkInAt: string;
    building: Building;
  } | null;
  todayEntries: Array<{
    buildingId: string;
    checkInAt: string;
    checkOutAt: string | null;
    building: Building;
  }>;
}

function mergeBuildingsWithAttendance(
  base: Building[],
  summary: AttendanceTodaySummary | null,
): Building[] {
  if (!summary) return base;

  const byId = new Map(base.map((building) => [building.id, building]));

  for (const entry of summary.todayEntries) {
    if (!byId.has(entry.buildingId)) {
      byId.set(entry.buildingId, entry.building);
    }
  }

  if (summary.active && !byId.has(summary.active.buildingId)) {
    byId.set(summary.active.buildingId, summary.active.building);
  }

  const activeId = summary.active?.buildingId;
  return Array.from(byId.values()).sort((a, b) => {
    if (a.id === activeId) return -1;
    if (b.id === activeId) return 1;
    return a.name.localeCompare(b.name, 'es');
  });
}

function getHeaderSubtitle(summary: AttendanceTodaySummary | null): string {
  if (summary?.active) {
    const time = new Date(summary.active.checkInAt).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `Estás fichado en ${summary.active.building.name} (desde ${time})`;
  }

  if (summary?.todayEntries.length) {
    const names = [...new Set(summary.todayEntries.map((entry) => entry.building.name))];
    if (names.length === 1) return `Fichaste hoy en ${names[0]}`;
    return `Fichaste hoy en ${names.length} edificios`;
  }

  return 'Seleccioná un edificio para comenzar';
}

function formatCheckInTime(checkInAt: string): string {
  return new Date(checkInAt).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function countPendingAcceptByBuilding(
  items: WorkOrderCached[],
  userId: string,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const wo of items) {
    if (isWorkOrderExpired(wo)) continue;
    const assignment = getUserAssignment(wo, userId);
    if (assignment?.status !== 'PENDING') continue;
    counts.set(wo.buildingId, (counts.get(wo.buildingId) ?? 0) + 1);
  }

  return counts;
}

export default function BuildingSelectScreen() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceTodaySummary | null>(null);
  const [pendingByBuilding, setPendingByBuilding] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const { user, logout } = useAuthStore();
  const { selectBuilding, isLoadingPrefetch } = useBuildingStore();

  const activeBuildingId = attendanceSummary?.active?.buildingId ?? null;
  const todayBuildingIds = useMemo(
    () => new Set(attendanceSummary?.todayEntries.map((entry) => entry.buildingId) ?? []),
    [attendanceSummary],
  );

  const displayedBuildings = useMemo(
    () => mergeBuildingsWithAttendance(buildings, attendanceSummary),
    [buildings, attendanceSummary],
  );

  const loadAttendanceSummary = useCallback(async () => {
    try {
      const summary = await apiService.get<AttendanceTodaySummary>('/attendance/today-summary');
      setAttendanceSummary(summary);
    } catch {
      setAttendanceSummary(null);
    }
  }, []);

  const loadPendingCounts = useCallback(async (userId: string) => {
    try {
      const res = await apiService.get<unknown>(
        `/work-orders?assignedTo=${userId}&status=ASSIGNED&limit=100`,
      );
      setPendingByBuilding(countPendingAcceptByBuilding(normalizeWorkOrdersList(res), userId));
    } catch {
      setPendingByBuilding(new Map());
    }
  }, []);

  const loadBuildings = useCallback(async () => {
    try {
      const [buildingsRes] = await Promise.all([
        apiService.get<BuildingsResponse | Building[]>('/buildings'),
        loadAttendanceSummary(),
      ]);
      setBuildings(normalizeBuildingsList(buildingsRes));
      if (user?.id) {
        await loadPendingCounts(user.id);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudieron cargar los edificios');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [loadAttendanceSummary, loadPendingCounts, user?.id]);

  useEffect(() => {
    loadBuildings();
  }, [loadBuildings]);

  async function handleSelect(building: Building) {
    setSelectingId(building.id);
    try {
      await selectBuilding(building);
      // Navigation handled by _layout.tsx guard
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo seleccionar el edificio');
    } finally {
      setSelectingId(null);
    }
  }

  function renderBuilding({ item }: { item: Building }) {
    const isSelecting = selectingId === item.id;
    const hasGPS = item.latitude && item.longitude;
    const pendingCount = pendingByBuilding.get(item.id) ?? 0;
    const isActiveNow = activeBuildingId === item.id;
    const checkedInToday = todayBuildingIds.has(item.id);
    const todayEntry = attendanceSummary?.todayEntries.find((entry) => entry.buildingId === item.id);

    return (
      <TouchableOpacity
        style={[styles.card, isActiveNow && styles.cardActive]}
        onPress={() => handleSelect(item)}
        disabled={!!selectingId || isLoadingPrefetch}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            {isActiveNow ? (
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>Fichado</Text>
              </View>
            ) : null}
          </View>
          {item.address && <Text style={styles.cardAddress}>{item.address}</Text>}
          <View style={styles.cardMeta}>
            <View style={[styles.badge, hasGPS ? styles.badgeOk : styles.badgeWarn]}>
              <Text style={styles.badgeText}>
                {hasGPS ? `GPS ${item.gpsRadiusM}m` : 'Sin GPS'}
              </Text>
            </View>
            {isActiveNow ? (
              <View style={[styles.badge, styles.badgeActive]}>
                <Ionicons name="checkmark-circle" size={11} color={COLORS.success} />
                <Text style={styles.badgeActiveText}>
                  Fichado ahora
                  {todayEntry ? ` · ${formatCheckInTime(todayEntry.checkInAt)}` : ''}
                </Text>
              </View>
            ) : checkedInToday ? (
              <View style={[styles.badge, styles.badgeToday]}>
                <Ionicons name="time-outline" size={11} color={COLORS.primary} />
                <Text style={styles.badgeTodayText}>
                  Fichaste hoy
                  {todayEntry ? ` · ${formatCheckInTime(todayEntry.checkInAt)}` : ''}
                </Text>
              </View>
            ) : null}
            {pendingCount > 0 ? (
              <View style={[styles.badge, styles.badgePending]}>
                <Ionicons name="clipboard-outline" size={11} color={COLORS.warning} />
                <Text style={styles.badgePendingText}>
                  {pendingCount === 1
                    ? '1 servicio pendiente de aceptar'
                    : `${pendingCount} servicios pendientes de aceptar`}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {isSelecting ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : (
          <Text style={styles.arrow}>›</Text>
        )}
      </TouchableOpacity>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <BrandLogo variant="icon" size={56} />
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
        <Text style={styles.loadingText}>Cargando edificios...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BrandedScreenHeader
        title={`Hola, ${user?.fullName ?? 'usuario'}`}
        subtitle={getHeaderSubtitle(attendanceSummary)}
        right={
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Salir</Text>
          </TouchableOpacity>
        }
      />

      <FlatList
        data={displayedBuildings}
        keyExtractor={(item) => item.id}
        renderItem={renderBuilding}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            loadBuildings();
          }} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No hay edificios disponibles</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: COLORS.bg },
  loader: { marginTop: 8 },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoutText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardActive: {
    borderColor: COLORS.success,
    backgroundColor: '#f0fdf4',
  },
  cardContent: { flex: 1 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  activePill: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activePillText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cardAddress: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeOk: { backgroundColor: '#dcfce7' },
  badgeWarn: { backgroundColor: '#fef3c7' },
  badgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    flexShrink: 1,
  },
  badgePendingText: { fontSize: 11, fontWeight: '600', color: COLORS.warning, flexShrink: 1 },
  badgeActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    flexShrink: 1,
  },
  badgeActiveText: { fontSize: 11, fontWeight: '600', color: COLORS.success, flexShrink: 1 },
  badgeToday: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    flexShrink: 1,
  },
  badgeTodayText: { fontSize: 11, fontWeight: '600', color: COLORS.primary, flexShrink: 1 },
  badgeText: { fontSize: 11, fontWeight: '600', color: COLORS.text },
  arrow: { fontSize: 24, color: COLORS.disabled, marginLeft: 8 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
});
