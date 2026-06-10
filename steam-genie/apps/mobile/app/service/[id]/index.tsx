import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../../../src/services/api.service';
import { useBuildingStore, WorkOrderCached } from '../../../src/stores/building.store';
import { syncQueue, generateClientId } from '../../../src/sync/sync-queue';
import { useNetworkStatus } from '../../../src/hooks/useNetworkStatus';
import { useSyncStore } from '../../../src/stores/sync.store';
import { COLORS } from '../../../src/constants/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkOrderDetail extends WorkOrderCached {
  description: string | null;
  building: { id: string; name: string };
  zone: { id: string; name: string } | null;
  subzone: { id: string; name: string } | null;
  serviceExecutions: Array<{
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
  }>;
  assignments: Array<{
    userId: string;
    status: string;
    user?: { fullName: string };
  }>;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isConnected } = useNetworkStatus();
  const isOnline = isConnected ?? true;
  const { setStatus } = useSyncStore();
  const { prefetchData } = useBuildingStore();

  const [workOrder, setWorkOrder] = useState<WorkOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadWorkOrder = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      if (isOnline) {
        const data = await apiService.get<WorkOrderDetail>(`/work-orders/${id}`);
        setWorkOrder(data);
      } else {
        // Fall back to prefetch cache
        const cached = prefetchData?.workOrders.find((wo) => wo.id === id);
        if (cached) {
          setWorkOrder(cached as unknown as WorkOrderDetail);
        }
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cargar el servicio');
    } finally {
      setIsLoading(false);
    }
  }, [id, isOnline, prefetchData]);

  useEffect(() => {
    loadWorkOrder();
  }, [loadWorkOrder]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleAccept() {
    if (!workOrder) return;
    setActionLoading(true);
    try {
      if (isOnline) {
        await apiService.post(`/work-orders/${workOrder.id}/accept`, {});
        await loadWorkOrder();
      } else {
        Alert.alert('Sin conexión', 'No es posible aceptar servicios sin conexión.');
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo aceptar');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStart() {
    if (!workOrder) return;
    setActionLoading(true);
    try {
      const occurredAt = new Date().toISOString();
      if (isOnline) {
        const res = await apiService.post<{ id: string; workOrderId: string }>(
          `/work-orders/${workOrder.id}/start`,
          { clientOperationId: generateClientId() },
        );
        await loadWorkOrder();
        // Navigate to checklist with seId
        router.push(`/service/${workOrder.id}/checklist?seId=${res.id}`);
      } else {
        const clientOperationId = generateClientId();
        await syncQueue.enqueue({
          id: generateClientId(),
          clientOperationId,
          operationType: 'START_WORK_ORDER',
          entityType: 'WORK_ORDER',
          entityId: workOrder.id,
          payload: { deviceId: 'mobile' },
          occurredAt,
        });
        setStatus('pending');
        Alert.alert(
          'Sin conexión',
          'El inicio de servicio fue guardado para sincronizar cuando tengas conexión.',
        );
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo iniciar');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleComplete() {
    if (!workOrder) return;
    Alert.alert(
      'Completar servicio',
      '¿Confirmás que todas las tareas fueron realizadas?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Completar',
          onPress: async () => {
            setActionLoading(true);
            try {
              if (isOnline) {
                await apiService.post(`/work-orders/${workOrder.id}/complete`, {
                  clientOperationId: generateClientId(),
                });
                await loadWorkOrder();
              } else {
                const clientOperationId = generateClientId();
                await syncQueue.enqueue({
                  id: generateClientId(),
                  clientOperationId,
                  operationType: 'COMPLETE_WORK_ORDER',
                  entityType: 'WORK_ORDER',
                  entityId: workOrder.id,
                  payload: { deviceId: 'mobile', baseVersion: workOrder.version },
                  occurredAt: new Date().toISOString(),
                });
                setStatus('pending');
                Alert.alert('Guardado', 'La completitud se sincronizará al recuperar conexión.');
              }
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo completar');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  }

  function openChecklist() {
    if (!workOrder) return;
    const se = workOrder.serviceExecutions?.[0];
    if (!se) {
      Alert.alert('Sin ejecución', 'No se encontró una ejecución activa para este servicio.');
      return;
    }
    router.push(`/service/${workOrder.id}/checklist?seId=${se.id}`);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!workOrder) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Servicio no encontrado</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[workOrder.status] ?? COLORS.disabled;
  const statusLabel = STATUS_LABELS[workOrder.status] ?? workOrder.status;
  const activeExecution = workOrder.serviceExecutions?.[0] ?? null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: statusColor }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{statusLabel}</Text>
        </View>
        <Text style={styles.headerType}>{TYPE_LABELS[workOrder.type] ?? workOrder.type}</Text>
        <Text style={styles.headerTitle} numberOfLines={2}>{workOrder.title}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadWorkOrder} />}
      >
        {/* Info */}
        <View style={styles.card}>
          {workOrder.description && (
            <>
              <Text style={styles.label}>Descripción</Text>
              <Text style={styles.value}>{workOrder.description}</Text>
            </>
          )}
          <Text style={styles.label}>Edificio</Text>
          <Text style={styles.value}>{workOrder.building?.name ?? '—'}</Text>
          {workOrder.zone && (
            <>
              <Text style={styles.label}>Zona</Text>
              <Text style={styles.value}>
                {workOrder.zone.name}{workOrder.subzone ? ` › ${workOrder.subzone.name}` : ''}
              </Text>
            </>
          )}
          {workOrder.scheduledDate && (
            <>
              <Text style={styles.label}>Fecha programada</Text>
              <Text style={styles.value}>
                {new Date(workOrder.scheduledDate).toLocaleDateString('es-AR', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </Text>
            </>
          )}
        </View>

        {/* Tasks summary */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Tareas ({workOrder.workOrderTasks.length})
          </Text>
          {workOrder.workOrderTasks.map((task) => (
            <View key={task.id} style={styles.taskRow}>
              <Ionicons name="ellipse-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.taskName}>{task.nameSnapshot}</Text>
              {task.requiresPhotoSnapshot && (
                <Ionicons name="camera-outline" size={14} color={COLORS.primary} />
              )}
            </View>
          ))}
          {workOrder.workOrderTasks.length === 0 && (
            <Text style={styles.emptySmall}>Sin tareas registradas</Text>
          )}
        </View>

        {/* Execution status */}
        {activeExecution && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Ejecución activa</Text>
            <Text style={styles.label}>Estado</Text>
            <Text style={styles.value}>{STATUS_LABELS[activeExecution.status] ?? activeExecution.status}</Text>
            <Text style={styles.label}>Iniciado</Text>
            <Text style={styles.value}>
              {new Date(activeExecution.startedAt).toLocaleString('es-AR')}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {workOrder.status === 'ASSIGNED' && (
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, actionLoading && styles.btnDisabled]}
              onPress={handleAccept}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="checkmark-outline" size={20} color="#fff" />
                  <Text style={styles.btnText}>Aceptar servicio</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {workOrder.status === 'ACCEPTED' && (
            <TouchableOpacity
              style={[styles.btn, styles.btnSuccess, actionLoading && styles.btnDisabled]}
              onPress={handleStart}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="play-outline" size={20} color="#fff" />
                  <Text style={styles.btnText}>Iniciar servicio</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {workOrder.status === 'IN_PROGRESS' && (
            <>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={openChecklist}
              >
                <Ionicons name="list-outline" size={20} color="#fff" />
                <Text style={styles.btnText}>Ver checklist</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnSuccess, actionLoading && styles.btnDisabled]}
                onPress={handleComplete}
                disabled={actionLoading}
              >
                {actionLoading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
                    <Text style={styles.btnText}>Completar servicio</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  header: { padding: 20, paddingTop: 60, gap: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: '#fff', fontSize: 14, marginLeft: 4 },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  headerType: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff', lineHeight: 26 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  label: { fontSize: 11, color: COLORS.textMuted, marginTop: 8 },
  value: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  taskName: { flex: 1, fontSize: 13, color: COLORS.text },
  emptySmall: { fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic' },
  actionsContainer: { gap: 10 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 16,
  },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnSuccess: { backgroundColor: COLORS.success },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
});
