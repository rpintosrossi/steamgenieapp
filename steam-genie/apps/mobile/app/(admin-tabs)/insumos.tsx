import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  BUILDING_STOCK_ALERT_STATUS_LABELS,
  BUILDING_STOCK_ALERT_TYPE_LABELS,
  STOCK_SHIPMENT_DESTINATION_STATUS_LABELS,
  STOCK_SHIPMENT_ORDER_STATUS_LABELS,
  formatStoredCalendarDate,
} from '@steam-genie/shared-constants';
import { AuthenticatedImage } from '../../src/components/AuthenticatedImage';
import { BrandedScreenHeader } from '../../src/components/BrandedScreenHeader';
import { COLORS } from '../../src/constants/colors';
import {
  adminApi,
  type BuildingStockAlertRow,
  type ShipmentDestinationItem,
  type ShipmentOrderItem,
} from '../../src/services/admin-api';

type Segment = 'reclamos' | 'envios';

export default function AdminInsumosScreen() {
  const [segment, setSegment] = useState<Segment>('reclamos');
  const [alerts, setAlerts] = useState<BuildingStockAlertRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const [photoAlert, setPhotoAlert] = useState<BuildingStockAlertRow | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [alertRows, shipmentRows] = await Promise.all([
        adminApi.listAlerts(),
        adminApi.listShipments(),
      ]);
      setAlerts(alertRows);
      setShipments(shipmentRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los insumos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  function confirmDeliver(dest: ShipmentDestinationItem, orderRef: string) {
    Alert.alert(
      'Confirmar entrega',
      `¿Confirmás la entrega de ${orderRef} en ${dest.building.name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setDeliveringId(dest.id);
            try {
              await adminApi.deliverDestination(dest.id);
              await load();
            } catch (e) {
              Alert.alert(
                'Error',
                e instanceof Error ? e.message : 'No se pudo confirmar la entrega',
              );
            } finally {
              setDeliveringId(null);
            }
          },
        },
      ],
    );
  }

  function confirmResolveAlert(alert: BuildingStockAlertRow) {
    Alert.alert(
      'Resolver reclamo',
      `¿Marcar como resuelta la alerta de «${alert.product.name}» en ${alert.building.name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resolver',
          onPress: async () => {
            setResolvingAlertId(alert.id);
            try {
              await adminApi.resolveAlert(alert.id);
              await load();
            } catch (e) {
              Alert.alert(
                'Error',
                e instanceof Error ? e.message : 'No se pudo resolver el reclamo',
              );
            } finally {
              setResolvingAlertId(null);
            }
          },
        },
      ],
    );
  }

  const photoPath = photoAlert
    ? photoAlert.photoUrl || `/stock-logistics/alerts/${photoAlert.id}/photo`
    : null;

  return (
    <View style={styles.container}>
      <BrandedScreenHeader
        title="Insumos"
        subtitle="Reclamos y envíos a edificios"
      />

      <View style={styles.segments}>
        <TouchableOpacity
          style={[styles.segment, segment === 'reclamos' && styles.segmentActive]}
          onPress={() => setSegment('reclamos')}
        >
          <Text
            style={[styles.segmentText, segment === 'reclamos' && styles.segmentTextActive]}
          >
            Reclamos ({alerts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, segment === 'envios' && styles.segmentActive]}
          onPress={() => setSegment('envios')}
        >
          <Text style={[styles.segmentText, segment === 'envios' && styles.segmentTextActive]}>
            Envíos ({shipments.length})
          </Text>
        </TouchableOpacity>
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
                void load();
              }}
            />
          }
        >
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {segment === 'reclamos' &&
            (alerts.length === 0 ? (
              <Text style={styles.empty}>No hay reclamos abiertos</Text>
            ) : (
              alerts.map((alert) => (
                <View key={alert.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{alert.product.name}</Text>
                    <Text style={styles.badge}>
                      {BUILDING_STOCK_ALERT_STATUS_LABELS[alert.status] ?? alert.status}
                    </Text>
                  </View>
                  <Text style={styles.meta}>
                    {BUILDING_STOCK_ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType}
                    {' · '}
                    {alert.building.name}
                  </Text>
                  <Text style={styles.meta}>
                    Reportó {alert.reportedBy.fullName} ·{' '}
                    {new Date(alert.createdAt).toLocaleString('es-AR')}
                  </Text>
                  {alert.note ? <Text style={styles.note}>{alert.note}</Text> : null}
                  {(alert.photoUrl || alert.photoStorageKey) && (
                    <TouchableOpacity
                      style={styles.photoBtn}
                      onPress={() => setPhotoAlert(alert)}
                    >
                      <AuthenticatedImage
                        pathOrUrl={
                          alert.photoUrl || `/stock-logistics/alerts/${alert.id}/photo`
                        }
                        style={styles.photoThumb}
                      />
                      <Text style={styles.link}>Ver foto</Text>
                    </TouchableOpacity>
                  )}
                  {alert.shipmentDestination ? (
                    <Text style={styles.meta}>
                      Envío {alert.shipmentDestination.order.reference}
                      {alert.shipmentDestination.deliveryDate
                        ? ` · entrega ${formatStoredCalendarDate(alert.shipmentDestination.deliveryDate)}`
                        : ''}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    style={styles.resolveBtn}
                    disabled={resolvingAlertId === alert.id}
                    onPress={() => confirmResolveAlert(alert)}
                  >
                    {resolvingAlertId === alert.id ? (
                      <ActivityIndicator color={COLORS.primary} size="small" />
                    ) : (
                      <Text style={styles.resolveBtnText}>Marcar resuelta</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))
            ))}

          {segment === 'envios' &&
            (shipments.length === 0 ? (
              <Text style={styles.empty}>No hay órdenes de envío</Text>
            ) : (
              shipments.map((order) => (
                <View key={order.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{order.reference}</Text>
                    <Text style={styles.badge}>
                      {STOCK_SHIPMENT_ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </Text>
                  </View>
                  {order.sourceWarehouse?.name ? (
                    <Text style={styles.meta}>Depósito: {order.sourceWarehouse.name}</Text>
                  ) : null}
                  {order.notes ? <Text style={styles.note}>{order.notes}</Text> : null}

                  {order.destinations.map((dest) => (
                    <View key={dest.id} style={styles.destBox}>
                      <View style={styles.cardTop}>
                        <Text style={styles.destTitle}>{dest.building.name}</Text>
                        <Text style={styles.badgeSm}>
                          {STOCK_SHIPMENT_DESTINATION_STATUS_LABELS[dest.status] ??
                            dest.status}
                        </Text>
                      </View>
                      {dest.deliveryDate ? (
                        <Text style={styles.meta}>
                          Fecha: {formatStoredCalendarDate(dest.deliveryDate)}
                        </Text>
                      ) : null}
                      {dest.lines.map((line) => (
                        <Text key={line.id} style={styles.meta}>
                          · {line.product.name}: {line.quantity}
                        </Text>
                      ))}
                      {dest.status === 'PENDING' && order.status === 'DISPATCHED' ? (
                        <TouchableOpacity
                          style={styles.deliverBtn}
                          disabled={deliveringId === dest.id}
                          onPress={() => confirmDeliver(dest, order.reference)}
                        >
                          {deliveringId === dest.id ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.deliverBtnText}>Confirmar entrega</Text>
                          )}
                        </TouchableOpacity>
                      ) : null}
                      {dest.deliveredAt ? (
                        <Text style={styles.meta}>
                          Entregado {new Date(dest.deliveredAt).toLocaleString('es-AR')}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ))
            ))}
        </ScrollView>
      )}

      <Modal visible={!!photoAlert} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setPhotoAlert(null)}>
          <View style={styles.photoModal}>
            <AuthenticatedImage pathOrUrl={photoPath} style={styles.photoLarge} />
            <TouchableOpacity onPress={() => setPhotoAlert(null)}>
              <Text style={styles.link}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  segments: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: COLORS.border,
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentActive: { backgroundColor: COLORS.surface },
  segmentText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  segmentTextActive: { color: COLORS.primary },
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
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    backgroundColor: '#e8f0fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeSm: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  meta: { fontSize: 12, color: COLORS.textMuted },
  note: { fontSize: 13, color: COLORS.text, marginTop: 4 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  photoThumb: { width: 48, height: 48, borderRadius: 6 },
  link: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },
  destBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    gap: 2,
  },
  destTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, flex: 1 },
  deliverBtn: {
    marginTop: 10,
    backgroundColor: COLORS.success,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deliverBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  resolveBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  resolveBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 40 },
  errorText: { color: COLORS.error, marginBottom: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  photoModal: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  photoLarge: { width: '100%', height: 320, borderRadius: 8 },
});
