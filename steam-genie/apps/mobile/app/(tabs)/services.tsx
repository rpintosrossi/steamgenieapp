import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBuildingStore, WorkOrderCached } from '../../src/stores/building.store';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { apiService } from '../../src/services/api.service';
import { SyncStatusBar } from '../../src/components/SyncStatusBar';
import { COLORS } from '../../src/constants/colors';

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

const TYPE_LABELS: Record<string, string> = {
  PREVENTIVE: 'Preventivo',
  CORRECTIVE: 'Correctivo',
  CLEANING: 'Limpieza',
  INSPECTION: 'Inspección',
};

interface WorkOrdersResponse {
  data: WorkOrderCached[];
  total: number;
}

const ACTIVE_STATUSES = ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'];

export default function ServicesScreen() {
  const router = useRouter();
  const { selectedBuilding, prefetchData, refreshPrefetch, isLoadingPrefetch } = useBuildingStore();
  const { isConnected } = useNetworkStatus();
  const isOnline = isConnected ?? true;

  const [workOrders, setWorkOrders] = useState<WorkOrderCached[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'active' | 'all'>('active');

  const loadFromApi = useCallback(async () => {
    if (!selectedBuilding || !isOnline) return;
    setIsLoading(true);
    try {
      const res = await apiService.get<WorkOrdersResponse>(
        `/work-orders?buildingId=${selectedBuilding.id}&limit=50`,
      );
      setWorkOrders(res.data);
    } catch {
      // Fall back to prefetch cache on error
    } finally {
      setIsLoading(false);
    }
  }, [selectedBuilding, isOnline]);

  useEffect(() => {
    if (isOnline) {
      loadFromApi();
    } else {
      setWorkOrders(prefetchData?.workOrders ?? []);
    }
  }, [isOnline, prefetchData?.workOrders]);

  const displayedWOs = activeFilter === 'active'
    ? workOrders.filter((wo) => ACTIVE_STATUSES.includes(wo.status))
    : workOrders;

  function renderItem({ item }: { item: WorkOrderCached }) {
    const statusColor = STATUS_COLORS[item.status] ?? COLORS.disabled;
    const statusLabel = STATUS_LABELS[item.status] ?? item.status;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/service/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusBadgeText}>{statusLabel}</Text>
          </View>
          <Text style={styles.cardType}>{TYPE_LABELS[item.type] ?? item.type}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        {item.description && (
          <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
        )}
        <View style={styles.cardFooter}>
          {item.scheduledDate && (
            <View style={styles.footerItem}>
              <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.footerText}>
                {new Date(item.scheduledDate).toLocaleDateString('es-AR')}
              </Text>
            </View>
          )}
          <View style={styles.footerItem}>
            <Ionicons name="list-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.footerText}>{item.workOrderTasks.length} tareas</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const refreshing = isLoadingPrefetch || isLoading;

  return (
    <View style={styles.container}>
      <SyncStatusBar />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mis servicios</Text>
        <Text style={styles.headerBuilding}>{selectedBuilding?.name ?? ''}</Text>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterTab, activeFilter === 'active' && styles.filterTabActive]}
          onPress={() => setActiveFilter('active')}
        >
          <Text style={[styles.filterTabText, activeFilter === 'active' && styles.filterTabTextActive]}>
            Activos ({workOrders.filter((wo) => ACTIVE_STATUSES.includes(wo.status)).length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, activeFilter === 'all' && styles.filterTabActive]}
          onPress={() => setActiveFilter('all')}
        >
          <Text style={[styles.filterTabText, activeFilter === 'all' && styles.filterTabTextActive]}>
            Todos ({workOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayedWOs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={isOnline ? loadFromApi : refreshPrefetch}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="clipboard-outline" size={48} color={COLORS.disabled} />
              <Text style={styles.emptyText}>No hay servicios {activeFilter === 'active' ? 'activos' : ''}</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 20, paddingTop: 60, backgroundColor: COLORS.primary, gap: 2 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerBuilding: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  filterRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterTab: { flex: 1, padding: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterTabActive: { borderBottomColor: COLORS.primary },
  filterTabText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  filterTabTextActive: { color: COLORS.primary, fontWeight: '700' },
  list: { padding: 16, gap: 12 },
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
  center: { padding: 32, alignItems: 'center' },
  empty: { padding: 48, alignItems: 'center', gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
});
