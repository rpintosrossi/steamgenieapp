import { useState, useCallback, useRef, useEffect } from 'react';
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
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../../../src/services/api.service';
import { useBuildingStore, WorkOrderCached, RejectionReason } from '../../../src/stores/building.store';
import { useAuthStore } from '../../../src/stores/auth.store';
import { syncQueue, generateClientId } from '../../../src/sync/sync-queue';
import { useNetworkStatus } from '../../../src/hooks/useNetworkStatus';
import { useSyncStore } from '../../../src/stores/sync.store';
import { COLORS } from '../../../src/constants/colors';
import { getWorkOrderTypeLabel } from '../../../src/constants/work-order-types';
import { CheckoutReservationCard } from '../../../src/components/CheckoutReservationCard';
import {
  ATTENDANCE_REQUIRED_MESSAGE,
  isCheckedInAtBuilding,
} from '../../../src/utils/attendance';
import {
  formatChecklistIncompleteMessage,
  formatPhotoRequiredMessage,
  getActiveServiceExecutionId,
  getUserAssignment,
  isChecklistIncompleteError,
  isPhotoRequiredError,
  isWorkOrderExpired,
} from '../../../src/utils/work-orders';
import { formatStoredCalendarDate } from '@steam-genie/shared-constants';
import type { ReservationSnapshot } from '../../../src/stores/building.store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkOrderDetail extends Omit<WorkOrderCached, 'workOrderTasks'> {
  description: string | null;
  building: { id: string; name: string };
  floor: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
  subzone: { id: string; name: string } | null;
  reservation: ReservationSnapshot | null;
  workOrderTasks?: Array<{
    id: string;
    nameSnapshot: string;
    sortOrder: number;
    requiresPhotoSnapshot: boolean;
    task?: { zoneId: string | null; subzoneId: string | null } | null;
  }>;
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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12);
  const { isConnected } = useNetworkStatus();
  const isOnline = isConnected ?? true;
  const { setStatus } = useSyncStore();
  const { prefetchData, refreshPrefetch, patchWorkOrder, removeWorkOrderFromPrefetch } =
    useBuildingStore();
  const user = useAuthStore((s) => s.user);

  const [workOrder, setWorkOrder] = useState<WorkOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectReasonPicker, setShowRejectReasonPicker] = useState(false);
  const hasLoadedRef = useRef(false);

  const serviceRejectionReasons = (prefetchData?.rejectionReasons ?? []).filter(
    (reason) => reason.type === 'SERVICE_REJECTION',
  );

  useEffect(() => {
    hasLoadedRef.current = false;
    setWorkOrder(null);
    setIsLoading(true);
  }, [id]);

  const loadWorkOrder = useCallback(async (mode: 'initial' | 'silent' | 'refresh' = 'initial') => {
    if (!id) return;
    if (mode === 'initial') setIsLoading(true);
    if (mode === 'refresh') setIsRefreshing(true);
    try {
      if (isOnline) {
        const data = await apiService.get<WorkOrderDetail>(`/work-orders/${id}`);
        setWorkOrder(data);

        const cached = useBuildingStore.getState().prefetchData?.workOrders.find((wo) => wo.id === data.id);
        if (
          !cached ||
          cached.status !== data.status ||
          cached.title !== data.title
        ) {
          patchWorkOrder(data.id, { status: data.status, title: data.title });
        }
      } else {
        const cached = useBuildingStore.getState().prefetchData?.workOrders.find((wo) => wo.id === id);
        if (cached) {
          setWorkOrder(cached as unknown as WorkOrderDetail);
        }
      }
    } catch (e) {
      if (mode !== 'silent') {
        Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cargar el servicio');
      }
    } finally {
      if (mode === 'initial') setIsLoading(false);
      if (mode === 'refresh') setIsRefreshing(false);
    }
  }, [id, isOnline, patchWorkOrder]);

  useFocusEffect(
    useCallback(() => {
      const mode = hasLoadedRef.current ? 'silent' : 'initial';
      void loadWorkOrder(mode).finally(() => {
        hasLoadedRef.current = true;
      });
    }, [loadWorkOrder]),
  );

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleAccept() {
    if (!workOrder) return;
    setActionLoading(true);
    try {
      if (isOnline) {
        await apiService.post(`/work-orders/${workOrder.id}/accept`, {});
        await refreshPrefetch();
        await loadWorkOrder('silent');
      } else {
        Alert.alert('Sin conexión', 'No es posible aceptar servicios sin conexión.');
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo aceptar');
    } finally {
      setActionLoading(false);
    }
  }

  function requestReject() {
    if (!workOrder) return;
    if (!isOnline) {
      Alert.alert('Sin conexión', 'No es posible rechazar servicios sin conexión.');
      return;
    }

    if (serviceRejectionReasons.length > 0) {
      setShowRejectReasonPicker(true);
      return;
    }

    Alert.alert(
      'Rechazar servicio',
      '¿Confirmás que no podés realizar este servicio? El encargado podrá reasignarlo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: () => void submitReject(),
        },
      ],
    );
  }

  async function submitReject(rejectionReasonId?: string) {
    if (!workOrder) return;
    setShowRejectReasonPicker(false);
    setActionLoading(true);
    try {
      await apiService.post<WorkOrderDetail>(
        `/work-orders/${workOrder.id}/reject`,
        rejectionReasonId ? { rejectionReasonId } : {},
      );
      removeWorkOrderFromPrefetch(workOrder.id);
      void refreshPrefetch();
      Alert.alert(
        'Servicio rechazado',
        'El encargado podrá reasignar este servicio a otro limpiador.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo rechazar el servicio');
    } finally {
      setActionLoading(false);
    }
  }

  function handleSelectRejectionReason(reason: RejectionReason) {
    setShowRejectReasonPicker(false);
    Alert.alert(
      'Rechazar servicio',
      `¿Confirmás el rechazo por "${reason.text}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: () => void submitReject(reason.id),
        },
      ],
    );
  }

  async function handleStart() {
    if (!workOrder) return;
    if (!canExecute) {
      Alert.alert('Fichaje requerido', ATTENDANCE_REQUIRED_MESSAGE);
      return;
    }
    setActionLoading(true);
    try {
      const occurredAt = new Date().toISOString();
      if (isOnline) {
        const updated = await apiService.post<WorkOrderDetail>(
          `/work-orders/${workOrder.id}/start`,
          { clientOperationId: generateClientId() },
        );
        const seId = getActiveServiceExecutionId(updated);
        if (!seId) {
          Alert.alert('Error', 'No se pudo obtener la ejecución del servicio. Intentá de nuevo.');
          return;
        }
        setWorkOrder(updated);
        patchWorkOrder(updated.id, { status: updated.status, title: updated.title });
        router.push(`/service/${workOrder.id}/checklist?seId=${seId}`);
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
    if (!canExecute) {
      Alert.alert('Fichaje requerido', ATTENDANCE_REQUIRED_MESSAGE);
      return;
    }
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
                const updated = await apiService.post<WorkOrderDetail>(
                  `/work-orders/${workOrder.id}/complete`,
                  {},
                );
                setWorkOrder(updated);
                patchWorkOrder(updated.id, { status: updated.status, title: updated.title });
                await refreshPrefetch();
                Alert.alert('Servicio completado', 'El servicio fue marcado como completado.');
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
              const message = e instanceof Error ? e.message : 'No se pudo completar';
              if (isChecklistIncompleteError(message)) {
                Alert.alert(
                  'Checklist incompleto',
                  formatChecklistIncompleteMessage(message),
                  [
                    { text: 'Cerrar', style: 'cancel' },
                    { text: 'Completar tareas', onPress: openChecklist },
                  ],
                );
              } else if (isPhotoRequiredError(message)) {
                Alert.alert(
                  'Falta foto obligatoria',
                  formatPhotoRequiredMessage(message),
                  [
                    { text: 'Cerrar', style: 'cancel' },
                    { text: 'Completar tareas', onPress: openChecklist },
                  ],
                );
              } else {
                Alert.alert('Error', message);
              }
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
    if (!canExecute) {
      Alert.alert('Fichaje requerido', ATTENDANCE_REQUIRED_MESSAGE);
      return;
    }
    const seId = getActiveServiceExecutionId(workOrder);
    if (!seId) {
      Alert.alert('Sin ejecución', 'No se encontró una ejecución activa para este servicio.');
      return;
    }
    router.push(`/service/${workOrder.id}/checklist?seId=${seId}`);
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
  const expired = isWorkOrderExpired(workOrder);
  const displayStatusLabel = expired ? 'Vencida' : statusLabel;
  const displayStatusColor = expired ? COLORS.error : statusColor;
  const activeExecution = workOrder.serviceExecutions?.[0] ?? null;
  const canExecute = isCheckedInAtBuilding(
    prefetchData?.activeAttendance,
    workOrder.building?.id ?? workOrder.buildingId,
  );
  const showExecutionBlocked =
    !canExecute &&
    (workOrder.status === 'ACCEPTED' || workOrder.status === 'IN_PROGRESS');
  const showCheckoutReservation =
    workOrder.type === 'CHECKOUT_CLEANING' &&
    workOrder.reservation &&
    ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'].includes(workOrder.status);
  const userAssignment = user?.id ? getUserAssignment(workOrder, user.id) : undefined;
  const canRespondToAssignment =
    userAssignment?.status === 'PENDING' && !expired;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: displayStatusColor }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{displayStatusLabel}</Text>
        </View>
        <Text style={styles.headerType}>{getWorkOrderTypeLabel(workOrder.type)}</Text>
        <Text style={styles.headerTitle} numberOfLines={2}>{workOrder.title}</Text>
      </View>

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => loadWorkOrder('refresh')} />
        }
      >
        <View style={styles.card}>
          {workOrder.description ? (
            <>
              <Text style={styles.label}>Descripción</Text>
              <Text style={styles.value}>{workOrder.description}</Text>
            </>
          ) : null}
          <Text style={styles.label}>Edificio</Text>
          <Text style={styles.value}>{workOrder.building?.name ?? '—'}</Text>
          {workOrder.scheduledDate ? (
            <>
              <Text style={styles.label}>Fecha programada</Text>
              <Text style={styles.value}>
                {formatStoredCalendarDate(workOrder.scheduledDate, 'es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </Text>
            </>
          ) : null}
        </View>

        {showCheckoutReservation && workOrder.reservation ? (
          <CheckoutReservationCard
            reservation={workOrder.reservation}
            workOrderLocation={{
              floor: workOrder.floor,
              zone: workOrder.zone,
              subzone: workOrder.subzone,
            }}
          />
        ) : null}

        {/* Execution status */}
        {activeExecution && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {workOrder.status === 'COMPLETED' ? 'Ejecución' : 'Ejecución activa'}
            </Text>
            <Text style={styles.label}>Estado</Text>
            <Text style={styles.value}>
              {STATUS_LABELS[activeExecution.status] ?? activeExecution.status}
            </Text>
            <Text style={styles.label}>Iniciado</Text>
            <Text style={styles.value}>
              {new Date(activeExecution.startedAt).toLocaleString('es-AR')}
            </Text>
            {activeExecution.completedAt && (
              <>
                <Text style={styles.label}>Completado</Text>
                <Text style={styles.value}>
                  {new Date(activeExecution.completedAt).toLocaleString('es-AR')}
                </Text>
              </>
            )}
          </View>
        )}

        {workOrder.status === 'COMPLETED' && (
          <View style={[styles.card, styles.completedCard]}>
            <Ionicons name="checkmark-circle" size={28} color={COLORS.success} />
            <Text style={styles.completedTitle}>Servicio completado</Text>
            <Text style={styles.completedText}>
              Este servicio ya no aparece en la pestaña Activos.
            </Text>
          </View>
        )}

        {expired && (
          <View style={[styles.card, styles.expiredNotice]}>
            <Ionicons name="time-outline" size={20} color={COLORS.error} />
            <Text style={styles.expiredNoticeText}>
              Este servicio venció. Solo podés consultarlo; no es posible aceptarlo ni iniciarlo.
            </Text>
          </View>
        )}

        {showExecutionBlocked && !expired && (
          <View style={[styles.card, styles.attendanceNotice]}>
            <Ionicons name="information-circle-outline" size={20} color={COLORS.warning} />
            <Text style={styles.attendanceNoticeText}>{ATTENDANCE_REQUIRED_MESSAGE}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {canRespondToAssignment && (
            <>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, actionLoading && styles.btnDisabled]}
                onPress={handleAccept}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-outline" size={20} color="#fff" />
                    <Text style={styles.btnText}>Aceptar servicio</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnReject, actionLoading && styles.btnDisabled]}
                onPress={requestReject}
                disabled={actionLoading}
              >
                <Ionicons name="close-outline" size={20} color={COLORS.error} />
                <Text style={styles.btnRejectText}>Rechazar servicio</Text>
              </TouchableOpacity>
            </>
          )}

          {workOrder.status === 'ACCEPTED' && !expired && userAssignment?.status === 'ACCEPTED' && (
            <TouchableOpacity
              style={[
                styles.btn,
                styles.btnSuccess,
                (actionLoading || !canExecute) && styles.btnDisabled,
              ]}
              onPress={handleStart}
              disabled={actionLoading || !canExecute}
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
                style={[styles.btn, styles.btnPrimary, !canExecute && styles.btnDisabled]}
                onPress={openChecklist}
                disabled={!canExecute}
              >
                <Ionicons name="list-outline" size={20} color="#fff" />
                <Text style={styles.btnText}>Ver checklist</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.btnSuccess,
                  (actionLoading || !canExecute) && styles.btnDisabled,
                ]}
                onPress={handleComplete}
                disabled={actionLoading || !canExecute}
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

      <Modal
        visible={showRejectReasonPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRejectReasonPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: 20 + bottomPad }]}>
            <Text style={styles.modalTitle}>Motivo de rechazo</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {workOrder.title}
            </Text>
            <FlatList
              data={serviceRejectionReasons}
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
              onPress={() => setShowRejectReasonPicker(false)}
            >
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  mainScroll: { flex: 1 },
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
  btnReject: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  btnRejectText: { color: COLORS.error, fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  completedCard: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  completedTitle: { fontSize: 16, fontWeight: '700', color: COLORS.success },
  completedText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  attendanceNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  attendanceNoticeText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },
  expiredNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  expiredNoticeText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },
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
});
