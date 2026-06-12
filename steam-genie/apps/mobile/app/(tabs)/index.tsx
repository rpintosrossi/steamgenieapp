import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBuildingStore, WorkOrderCached } from '../../src/stores/building.store';
import { useAuthStore } from '../../src/stores/auth.store';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { useAttendance } from '../../src/hooks/useAttendance';
import { useWorkTimer } from '../../src/hooks/useWorkTimer';
import { SyncStatusBar } from '../../src/components/SyncStatusBar';
import { BrandedScreenHeader } from '../../src/components/BrandedScreenHeader';
import { apiService } from '../../src/services/api.service';
import { COLORS } from '../../src/constants/colors';
import {
  categorizeWorkOrdersForUser,
  enrichWorkOrdersWithAssignments,
  excludeExpiredWorkOrders,
  formatWorkOrderScheduledDate,
  getWorkOrderTaskCount,
  normalizeWorkOrdersList,
  sortWorkOrdersByDate,
} from '../../src/utils/work-orders';

type ServiceTab = 'all' | 'pending' | 'accepted';

const TYPE_LABELS: Record<string, string> = {
  PREVENTIVE: 'Preventivo',
  CORRECTIVE: 'Correctivo',
  CLEANING: 'Limpieza',
  INSPECTION: 'Inspección',
  CHECKOUT_CLEANING: 'Limpieza checkout',
  ADDITIONAL_REQUEST: 'Pedido adicional',
};

function formatScheduledDate(dateStr: string | null | undefined): string {
  return formatWorkOrderScheduledDate(dateStr);
}

function formatLastCheckIn(dateStr: string): string {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} a las ${time}`;
}

interface LastAttendanceSummary {
  checkInAt: string;
}

export default function FichajeScreen() {
  const router = useRouter();
  const { selectedBuilding, prefetchData, isLoadingPrefetch, refreshPrefetch, clearBuilding } =
    useBuildingStore();
  const user = useAuthStore((s) => s.user);
  const { isConnected } = useNetworkStatus();
  const isOnline = isConnected ?? true;

  const { activeAttendance, isLoading, error, checkIn, checkOut, clearError } = useAttendance(isOnline);

  const [devGps, setDevGps] = useState<{ lat: number; lng: number } | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderCached[]>([]);
  const [lastCheckInAt, setLastCheckInAt] = useState<string | null>(null);
  const [showChangeBuilding, setShowChangeBuilding] = useState(false);

  const loadLastCheckIn = useCallback(async () => {
    if (prefetchData?.activeAttendance?.checkInAt) {
      setLastCheckInAt(prefetchData.activeAttendance.checkInAt);
      return;
    }
    if (!isOnline) {
      setLastCheckInAt(null);
      return;
    }
    try {
      const last = await apiService.get<LastAttendanceSummary | null>('/attendance/last');
      setLastCheckInAt(last?.checkInAt ?? null);
    } catch {
      setLastCheckInAt(null);
    }
  }, [isOnline, prefetchData?.activeAttendance?.checkInAt]);

  useEffect(() => {
    if (!__DEV__) return;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setDevGps({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });
      } catch {
        // optional in dev
      }
    })();
  }, []);

  const loadWorkOrders = useCallback(async () => {
    if (!selectedBuilding) return;
    try {
      let items: WorkOrderCached[] = [];
      if (isOnline) {
        const res = await apiService.get<unknown>(
          `/work-orders?buildingId=${selectedBuilding.id}&limit=50`,
        );
        items = normalizeWorkOrdersList(res);
      } else {
        items = normalizeWorkOrdersList(prefetchData?.workOrders ?? []);
      }
      setWorkOrders(enrichWorkOrdersWithAssignments(items, prefetchData?.workOrders));
    } catch {
      setWorkOrders(
        enrichWorkOrdersWithAssignments(
          normalizeWorkOrdersList(prefetchData?.workOrders ?? []),
          prefetchData?.workOrders,
        ),
      );
    }
  }, [selectedBuilding, isOnline, prefetchData?.workOrders]);

  useFocusEffect(
    useCallback(() => {
      void loadWorkOrders();
      void loadLastCheckIn();
    }, [loadWorkOrders, loadLastCheckIn]),
  );

  useEffect(() => {
    if (activeAttendance?.checkInAt) {
      setLastCheckInAt(activeAttendance.checkInAt);
    } else {
      void loadLastCheckIn();
    }
  }, [activeAttendance?.checkInAt, loadLastCheckIn]);

  const attendanceInThisBuilding =
    activeAttendance?.buildingId === selectedBuilding?.id ? activeAttendance : null;

  useEffect(() => {
    if (attendanceInThisBuilding) {
      setShowChangeBuilding(false);
    }
  }, [attendanceInThisBuilding]);

  async function handleCheckIn() {
    const success = await checkIn();
    if (success) setShowChangeBuilding(false);
  }

  async function handleCheckOut() {
    const success = await checkOut();
    if (success) setShowChangeBuilding(true);
  }

  function handleChangeBuilding() {
    Alert.alert(
      'Cambiar edificio',
      '¿Querés seleccionar otro edificio? Se cerrará la sesión del edificio actual.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cambiar',
          onPress: async () => {
            setShowChangeBuilding(false);
            await clearBuilding();
          },
        },
      ],
    );
  }

  const workTimer = useWorkTimer(attendanceInThisBuilding?.checkInAt);

  const { pending, accepted, all } = useMemo(() => {
    if (!user?.id) return { pending: [], accepted: [], all: [] };
    const categorized = categorizeWorkOrdersForUser(workOrders, user.id);
    const pendingActive = excludeExpiredWorkOrders(categorized.pending);
    const acceptedActive = excludeExpiredWorkOrders(categorized.accepted);
    return {
      pending: pendingActive,
      accepted: acceptedActive,
      all: sortWorkOrdersByDate([...pendingActive, ...acceptedActive]),
    };
  }, [workOrders, user?.id]);

  const checkInTime = attendanceInThisBuilding
    ? new Date(attendanceInThisBuilding.checkInAt).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const userDisplayName = user?.fullName ?? 'usuario';
  const lastCheckInLabel = lastCheckInAt ? formatLastCheckIn(lastCheckInAt) : null;

  return (
    <View style={styles.container}>
      <SyncStatusBar />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingPrefetch}
            onRefresh={async () => {
              await refreshPrefetch();
              await loadWorkOrders();
              await loadLastCheckIn();
            }}
          />
        }
      >
        <BrandedScreenHeader
          title={`Hola, ${userDisplayName}`}
          subtitle={
            lastCheckInLabel
              ? `Tu último fichaje fue el ${lastCheckInLabel}`
              : 'Todavía no registramos fichajes'
          }
          right={
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => router.push('/(tabs)/profile')}
              accessibilityLabel="Ir a mi perfil"
            >
              <Ionicons name="person-circle-outline" size={36} color={COLORS.primary} />
            </TouchableOpacity>
          }
        />
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>Modo sin conexión</Text>
            </View>
          </View>
        )}

        <View
          style={[
            styles.statusCard,
            attendanceInThisBuilding ? styles.statusCardActive : styles.statusCardIdle,
          ]}
        >
          <Ionicons
            name={attendanceInThisBuilding ? 'checkmark-circle' : 'time-outline'}
            size={48}
            color={attendanceInThisBuilding ? COLORS.success : COLORS.disabled}
          />
          {attendanceInThisBuilding ? (
            <>
              <Text style={styles.statusTitle}>Fichado</Text>
              {workTimer && (
                <>
                  <Text style={styles.timerLabel}>Tiempo trabajando</Text>
                  <Text style={styles.workTimer}>{workTimer}</Text>
                </>
              )}
              <Text style={styles.statusTime}>Entrada: {checkInTime}</Text>
              <Text style={styles.statusBldg}>{selectedBuilding?.name}</Text>
            </>
          ) : (
            <>
              <Text style={styles.statusTitleIdle}>Sin fichaje activo</Text>
              <Text style={styles.statusSubtitle}>Presioná "Fichar entrada" para comenzar</Text>
            </>
          )}
        </View>

        {error && (
          <TouchableOpacity style={styles.errorBox} onPress={clearError}>
            <Ionicons name="alert-circle" size={18} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
          </TouchableOpacity>
        )}

        {__DEV__ && devGps && (
          <View style={styles.infoBox}>
            <Ionicons name="navigate-outline" size={14} color={COLORS.textMuted} />
            <Text style={styles.infoText}>
              Tu ubicación (dev): {devGps.lat.toFixed(5)}, {devGps.lng.toFixed(5)}
            </Text>
          </View>
        )}
        {selectedBuilding?.latitude ? (
          <View style={styles.infoBox}>
            <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
            <Text style={styles.infoText}>
              Radio GPS: {selectedBuilding.gpsRadiusM}m — Tu ubicación se validará al fichar
            </Text>
          </View>
        ) : (
          <View style={[styles.infoBox, styles.infoBoxWarn]}>
            <Ionicons name="warning-outline" size={14} color={COLORS.warning} />
            <Text style={styles.infoText}>Este edificio no tiene GPS configurado</Text>
          </View>
        )}

        {!attendanceInThisBuilding ? (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnPrimary, isLoading && styles.actionBtnDisabled]}
              onPress={handleCheckIn}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={22} color="#fff" />
                  <Text style={styles.actionBtnText}>Fichar entrada</Text>
                </>
              )}
            </TouchableOpacity>

            {showChangeBuilding ? (
              <TouchableOpacity
                style={styles.changeBuildingBtn}
                onPress={handleChangeBuilding}
                disabled={isLoading}
              >
                <Ionicons name="business-outline" size={20} color={COLORS.primary} />
                <Text style={styles.changeBuildingBtnText}>Cambiar edificio</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger, isLoading && styles.actionBtnDisabled]}
            onPress={handleCheckOut}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={22} color="#fff" />
                <Text style={styles.actionBtnText}>Fichar salida</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {activeAttendance && !attendanceInThisBuilding && (
          <View style={[styles.infoBox, styles.infoBoxWarn]}>
            <Ionicons name="information-circle-outline" size={14} color={COLORS.warning} />
            <Text style={styles.infoText}>
              Tenés un fichaje activo en otro edificio. Al fichar aquí se cerrará automáticamente.
            </Text>
          </View>
        )}

        {selectedBuilding && (
          <WorkOrderTabbedList
            all={all}
            pending={pending}
            accepted={accepted}
            onPressItem={(id) => router.push(`/service/${id}`)}
          />
        )}
      </ScrollView>
    </View>
  );
}

function WorkOrderTabbedList({
  all,
  pending,
  accepted,
  onPressItem,
}: {
  all: WorkOrderCached[];
  pending: WorkOrderCached[];
  accepted: WorkOrderCached[];
  onPressItem: (id: string) => void;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ServiceTab>('all');

  const tabs: { key: ServiceTab; label: string; count: number }[] = [
    { key: 'all', label: 'Todas', count: all.length },
    { key: 'pending', label: 'Pendientes', count: pending.length },
    { key: 'accepted', label: 'Aceptadas', count: accepted.length },
  ];

  const items =
    activeTab === 'all' ? all : activeTab === 'pending' ? pending : accepted;

  const emptyMessages: Record<ServiceTab, string> = {
    all: 'No tenés servicios asignados',
    pending: 'No tenés servicios pendientes de aceptar',
    accepted: 'No tenés servicios aceptados',
  };

  const pendingIds = useMemo(() => new Set(pending.map((wo) => wo.id)), [pending]);

  return (
    <View style={styles.servicesPanel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Servicios</Text>
        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={() => router.push('/(tabs)/services')}
        >
          <Text style={styles.viewAllText}>Ver todas</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              <View style={[styles.tabCount, isActive && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>
                  {tab.count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.listCard}>
        {items.length === 0 ? (
          <Text style={styles.sectionEmpty}>{emptyMessages[activeTab]}</Text>
        ) : (
          items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.serviceRow}
              onPress={() => onPressItem(item.id)}
              activeOpacity={0.85}
            >
              <View style={styles.serviceRowMain}>
                <View style={styles.serviceRowTitleRow}>
                  <Text style={styles.serviceRowTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {activeTab === 'all' && (
                    <View
                      style={[
                        styles.statusPill,
                        pendingIds.has(item.id) ? styles.statusPillPending : styles.statusPillAccepted,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          pendingIds.has(item.id)
                            ? styles.statusPillTextPending
                            : styles.statusPillTextAccepted,
                        ]}
                      >
                        {pendingIds.has(item.id) ? 'Pendiente' : 'Aceptada'}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.serviceRowMeta}>
                  {formatScheduledDate(item.scheduledDate)}
                  {' · '}
                  {TYPE_LABELS[item.type] ?? item.type}
                  {' · '}
                  {getWorkOrderTaskCount(item)} tareas
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 40 },
  profileBtn: {
    padding: 2,
  },
  offlineBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  offlineBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.warning,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 6,
  },
  offlineBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  statusCard: {
    margin: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  statusCardActive: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
  statusCardIdle: { backgroundColor: COLORS.surface },
  statusTitle: { fontSize: 20, fontWeight: '700', color: COLORS.success },
  statusTitleIdle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  timerLabel: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  workTimer: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  statusTime: { fontSize: 15, fontWeight: '600', color: COLORS.textMuted, marginTop: 4 },
  statusBldg: { fontSize: 14, color: COLORS.textMuted },
  statusSubtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { flex: 1, color: COLORS.error, fontSize: 13 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
  },
  infoBoxWarn: { backgroundColor: '#fffbeb' },
  infoText: { flex: 1, color: COLORS.textMuted, fontSize: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 16,
  },
  actionBtnPrimary: { backgroundColor: COLORS.primary },
  actionBtnDanger: { backgroundColor: COLORS.error },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  changeBuildingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 12,
    padding: 14,
    backgroundColor: COLORS.surface,
  },
  changeBuildingBtnText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  servicesPanel: {
    marginHorizontal: 16,
    marginTop: 4,
    gap: 10,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  tabLabelActive: {
    color: '#fff',
  },
  tabCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tabCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  tabCountTextActive: {
    color: '#fff',
  },
  listCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  sectionEmpty: {
    padding: 16,
    fontSize: 13,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  serviceRowMain: { flex: 1, gap: 4 },
  serviceRowTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  serviceRowTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text },
  serviceRowMeta: { fontSize: 12, color: COLORS.textMuted },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusPillPending: { backgroundColor: '#fef3c7' },
  statusPillAccepted: { backgroundColor: '#dbeafe' },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  statusPillTextPending: { color: COLORS.warning },
  statusPillTextAccepted: { color: COLORS.primary },
});
