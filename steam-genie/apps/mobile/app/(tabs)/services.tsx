import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBuildingStore, WorkOrderCached } from '../../src/stores/building.store';
import { useAuthStore } from '../../src/stores/auth.store';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { apiService } from '../../src/services/api.service';
import { SyncStatusBar } from '../../src/components/SyncStatusBar';
import { BrandedScreenHeader } from '../../src/components/BrandedScreenHeader';
import { COLORS } from '../../src/constants/colors';
import { getWorkOrderTypeLabel } from '../../src/constants/work-order-types';
import {
  filterWorkOrdersAssignedToUser,
  formatWorkOrderScheduledDate,
  getWorkOrderTaskCount,
  isWorkOrderActive,
  isWorkOrderExpired,
  normalizeWorkOrdersList,
  sortWorkOrdersByDate,
} from '../../src/utils/work-orders';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  ASSIGNED: 'Asignado',
  ACCEPTED: 'Aceptado',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: COLORS.disabled,
  ASSIGNED: COLORS.warning,
  ACCEPTED: COLORS.primaryLight,
  IN_PROGRESS: COLORS.primary,
  COMPLETED: COLORS.success,
  REJECTED: COLORS.error,
  CANCELLED: COLORS.disabled,
};

interface WorkOrdersResponse {
  data?: WorkOrderCached[];
  total?: number;
}

function getStatusDisplay(item: WorkOrderCached) {
  if (isWorkOrderExpired(item)) {
    return { label: 'Vencida', color: COLORS.error };
  }
  return {
    label: STATUS_LABELS[item.status] ?? item.status,
    color: STATUS_COLORS[item.status] ?? COLORS.disabled,
  };
}

export default function ServicesScreen() {
  const router = useRouter();
  const { selectedBuilding, prefetchData, refreshPrefetch } = useBuildingStore();
  const { user } = useAuthStore();
  const { isConnected } = useNetworkStatus();
  const isOnline = isConnected ?? true;

  const [workOrders, setWorkOrders] = useState<WorkOrderCached[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isUserRefreshing, setIsUserRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'active' | 'all'>('active');

  const loadFromApi = useCallback(
    async (options?: { userRefresh?: boolean }) => {
      if (!selectedBuilding || !user?.id) return;

      if (options?.userRefresh) {
        setIsUserRefreshing(true);
      }

      try {
        if (isOnline) {
          const res = await apiService.get<WorkOrdersResponse | WorkOrderCached[]>(
            `/work-orders?buildingId=${selectedBuilding.id}&limit=50`,
          );
          setWorkOrders(
            filterWorkOrdersAssignedToUser(normalizeWorkOrdersList(res), user.id),
          );
        } else {
          setWorkOrders(
            filterWorkOrdersAssignedToUser(
              normalizeWorkOrdersList(prefetchData?.workOrders ?? []),
              user.id,
            ),
          );
        }
      } catch {
        setWorkOrders(
          filterWorkOrdersAssignedToUser(
            normalizeWorkOrdersList(prefetchData?.workOrders ?? []),
            user.id,
          ),
        );
      } finally {
        setIsInitialLoading(false);
        if (options?.userRefresh) {
          setIsUserRefreshing(false);
        }
      }
    },
    [selectedBuilding, isOnline, prefetchData?.workOrders, user?.id],
  );

  useEffect(() => {
    if (!user?.id || !prefetchData) return;

    const assignedIds = new Set(
      filterWorkOrdersAssignedToUser(prefetchData.workOrders, user.id).map((wo) => wo.id),
    );

    setWorkOrders((prev) => prev.filter((wo) => assignedIds.has(wo.id)));
  }, [prefetchData?.workOrders, user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadFromApi();
    }, [loadFromApi]),
  );

  async function handleRefresh() {
    setIsUserRefreshing(true);
    try {
      if (isOnline) {
        await loadFromApi();
      }
      await refreshPrefetch();
    } finally {
      setIsUserRefreshing(false);
    }
  }

  const displayedWOs = useMemo(() => {
    const filtered =
      activeFilter === 'active'
        ? workOrders.filter(isWorkOrderActive)
        : workOrders;
    return sortWorkOrdersByDate(filtered);
  }, [workOrders, activeFilter]);

  const activeCount = workOrders.filter(isWorkOrderActive).length;

  function renderItem({ item }: { item: WorkOrderCached }) {
    const { label, color } = getStatusDisplay(item);
    const taskCount = getWorkOrderTaskCount(item);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/service/${item.id}`)}
        activeOpacity={0.85}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: color }]}>
            <Text style={styles.statusBadgeText}>{label}</Text>
          </View>
          <Text style={styles.cardType}>{getWorkOrderTypeLabel(item.type)}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.cardFooter}>
          {item.scheduledDate ? (
            <View style={styles.footerItem}>
              <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.footerText}>
                {formatWorkOrderScheduledDate(item.scheduledDate)}
              </Text>
            </View>
          ) : null}
          <View style={styles.footerItem}>
            <Ionicons name="list-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.footerText}>{taskCount} tareas</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (isInitialLoading && workOrders.length === 0) {
    return (
      <View style={styles.container}>
        <SyncStatusBar />
        <BrandedScreenHeader
          title="Mis servicios"
          subtitle={selectedBuilding?.name ?? undefined}
        />
        <View style={styles.initialLoader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SyncStatusBar />
      <BrandedScreenHeader
        title="Mis servicios"
        subtitle={selectedBuilding?.name ?? undefined}
      />

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterTab, activeFilter === 'active' && styles.filterTabActive]}
          onPress={() => setActiveFilter('active')}
        >
          <Text
            style={[styles.filterTabText, activeFilter === 'active' && styles.filterTabTextActive]}
          >
            Activos ({activeCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, activeFilter === 'all' && styles.filterTabActive]}
          onPress={() => setActiveFilter('all')}
        >
          <Text
            style={[styles.filterTabText, activeFilter === 'all' && styles.filterTabTextActive]}
          >
            Todos ({workOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayedWOs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={displayedWOs.length === 0 ? styles.listEmpty : styles.list}
        refreshControl={
          <RefreshControl refreshing={isUserRefreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={48} color={COLORS.disabled} />
            <Text style={styles.emptyText}>
              No hay servicios {activeFilter === 'active' ? 'activos' : ''}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  initialLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterTab: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabActive: { borderBottomColor: COLORS.primary },
  filterTabText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  filterTabTextActive: { color: COLORS.primary, fontWeight: '700' },
  list: { padding: 16, paddingBottom: 24 },
  listEmpty: { flexGrow: 1, padding: 16, justifyContent: 'center' },
  separator: { height: 12 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardType: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardDesc: { fontSize: 13, color: COLORS.textMuted },
  cardFooter: { flexDirection: 'row', gap: 16, marginTop: 4 },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerText: { fontSize: 11, color: COLORS.textMuted },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
});
