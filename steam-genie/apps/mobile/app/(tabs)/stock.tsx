import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Keyboard,
  Platform,
  Pressable,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useBuildingStore } from '../../src/stores/building.store';
import { apiService } from '../../src/services/api.service';
import { SyncStatusBar } from '../../src/components/SyncStatusBar';
import { BrandedScreenHeader } from '../../src/components/BrandedScreenHeader';
import { COLORS } from '../../src/constants/colors';
import { formatStoredCalendarDate } from '@steam-genie/shared-constants';

const ALERT_TYPE_LABELS: Record<string, string> = {
  LOW_STOCK: 'Stock bajo',
  OUT_OF_STOCK: 'Sin stock',
  OBSERVATION: 'Observación',
};

const ALERT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Pendiente',
  IN_TRANSIT: 'En camino',
};

interface StockItem {
  id: string;
  quantity: number;
  product: { id: string; name: string; unitType: string; sku: string | null };
}

interface StockAlert {
  id: string;
  productId: string;
  alertType: string;
  status: string;
  note: string | null;
  deliveryDate: string | null;
  product: { id: string; name: string };
  shipmentDestination?: {
    deliveryDate: string | null;
    order: { reference: string };
  } | null;
}

interface PendingDelivery {
  id: string;
  deliveryDate: string | null;
  order: { id: string; reference: string };
  lines: Array<{
    quantity: number;
    product: { id: string; name: string; unitType: string };
  }>;
}

interface MobileStockResponse {
  items: StockItem[];
  alerts: StockAlert[];
  pendingDeliveries: PendingDelivery[];
}

function formatDate(iso: string | null) {
  if (!iso) return 'Sin fecha';
  return formatStoredCalendarDate(iso, 'es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function StockScreen() {
  const insets = useSafeAreaInsets();
  const modalScrollRef = useRef<ScrollView>(null);
  const { selectedBuilding, prefetchData } = useBuildingStore();
  const activeAttendance = prefetchData?.activeAttendance ?? null;
  const isCheckedIn =
    activeAttendance != null && activeAttendance.buildingId === selectedBuilding?.id;

  const [data, setData] = useState<MobileStockResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [alertModal, setAlertModal] = useState(false);
  const [alertProductId, setAlertProductId] = useState('');
  const [alertProductSearch, setAlertProductSearch] = useState('');
  const [alertType, setAlertType] = useState<'LOW_STOCK' | 'OUT_OF_STOCK' | 'OBSERVATION'>(
    'LOW_STOCK',
  );
  const [alertNote, setAlertNote] = useState('');
  const [alertPhoto, setAlertPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDeliveryId, setConfirmingDeliveryId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const loadStock = useCallback(async (options?: { silent?: boolean }) => {
    if (!selectedBuilding || !isCheckedIn) {
      setData(null);
      return;
    }
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const res = await apiService.get<MobileStockResponse>(
        `/stock-logistics/mobile/buildings/${selectedBuilding.id}`,
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el stock');
      if (!options?.silent) setData(null);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [isCheckedIn, selectedBuilding]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!alertModal) {
      setKeyboardHeight(0);
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [alertModal]);

  function scrollAlertModalToInput() {
    requestAnimationFrame(() => {
      modalScrollRef.current?.scrollToEnd({ animated: true });
    });
  }

  function closeAlertModal() {
    Keyboard.dismiss();
    setAlertProductSearch('');
    setAlertModal(false);
  }

  const alertModalBottomInset =
    keyboardHeight > 0 ? Math.max(0, keyboardHeight - insets.bottom) : 0;

  const filteredAlertProducts = useMemo(() => {
    const items = data?.items ?? [];
    const q = alertProductSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.product.name.toLowerCase().includes(q) ||
        (item.product.sku?.toLowerCase().includes(q) ?? false),
    );
  }, [alertProductSearch, data?.items]);

  const selectedAlertProduct = useMemo(
    () => (data?.items ?? []).find((item) => item.product.id === alertProductId) ?? null,
    [alertProductId, data?.items],
  );

  function openAlertModal() {
    setAlertProductSearch('');
    setAlertProductId('');
    setAlertType('LOW_STOCK');
    setAlertNote('');
    setAlertPhoto(null);
    setAlertModal(true);
  }

  useFocusEffect(
    useCallback(() => {
      void loadStock();
    }, [loadStock]),
  );

  async function pickPhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara para la foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
    });
    if (!result.canceled && result.assets?.[0]) {
      setAlertPhoto(result.assets[0]);
    }
  }

  async function submitAlert() {
    if (!selectedBuilding || !alertProductId) {
      Alert.alert('Datos incompletos', 'Seleccioná un producto.');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('productId', alertProductId);
      formData.append('alertType', alertType);
      if (alertNote.trim()) formData.append('note', alertNote.trim());
      if (alertPhoto) {
        formData.append('photo', {
          uri: alertPhoto.uri,
          name: 'alert.jpg',
          type: 'image/jpeg',
        } as unknown as Blob);
      }
      await apiService.postMultipart(
        `/stock-logistics/mobile/buildings/${selectedBuilding.id}/alerts`,
        formData,
      );
      setAlertModal(false);
      setAlertProductId('');
      setAlertNote('');
      setAlertPhoto(null);
      Alert.alert('Alerta enviada', 'El equipo de logística fue notificado.');
      await loadStock();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo crear la alerta');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelivery(delivery: PendingDelivery) {
    if (confirmingDeliveryId) return;

    Alert.alert(
      'Confirmar recepción',
      `¿Recibiste el envío ${delivery.order.reference}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: () => {
            void (async () => {
              setConfirmingDeliveryId(delivery.id);
              setError(null);
              try {
                await apiService.post(
                  `/stock-logistics/shipments/destinations/${delivery.id}/deliver`,
                  {},
                );
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        pendingDeliveries: prev.pendingDeliveries.filter(
                          (item) => item.id !== delivery.id,
                        ),
                      }
                    : prev,
                );
                setSuccessMessage('Entrega confirmada. El stock se actualizó.');
                void loadStock({ silent: true });
              } catch (err) {
                Alert.alert(
                  'Error',
                  err instanceof Error ? err.message : 'No se pudo confirmar',
                );
              } finally {
                setConfirmingDeliveryId(null);
              }
            })();
          },
        },
      ],
    );
  }

  const alertByProduct = new Map(
    (data?.alerts ?? []).map((a) => [a.productId, a]),
  );

  return (
    <View style={styles.container}>
      <SyncStatusBar />
      <BrandedScreenHeader
        title="Insumos"
        subtitle={selectedBuilding?.name ?? undefined}
      />

      {!selectedBuilding ? (
        <View style={styles.center}>
          <Ionicons name="business-outline" size={48} color={COLORS.disabled} />
          <Text style={styles.emptyTitle}>Sin edificio seleccionado</Text>
        </View>
      ) : !isCheckedIn ? (
        <View style={styles.center}>
          <Ionicons name="time-outline" size={48} color={COLORS.disabled} />
          <Text style={styles.emptyTitle}>Fichaje requerido</Text>
          <Text style={styles.emptyText}>
            Para ver y reportar stock tenés que estar fichado en este edificio.
          </Text>
        </View>
      ) : loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={loading && Boolean(data)}
              onRefresh={() => void loadStock()}
            />
          }
        >
          {successMessage ? (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={18} color="#047857" />
              <Text style={styles.successBannerText}>{successMessage}</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Productos</Text>
            <TouchableOpacity style={styles.addBtn} onPress={openAlertModal}>
              <Ionicons name="alert-circle-outline" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Reportar</Text>
            </TouchableOpacity>
          </View>

          {(data?.items ?? []).length === 0 ? (
            <Text style={styles.muted}>No hay productos habilitados en este edificio.</Text>
          ) : (
            (data?.items ?? []).map((item) => {
              const alert = alertByProduct.get(item.product.id);
              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardRow}>
                    <Text style={styles.productName}>{item.product.name}</Text>
                    <Text style={styles.qty}>{item.quantity}</Text>
                  </View>
                  {alert ? (
                    <View style={styles.alertRow}>
                      <Ionicons
                        name={alert.status === 'IN_TRANSIT' ? 'bus-outline' : 'warning-outline'}
                        size={14}
                        color={alert.status === 'IN_TRANSIT' ? COLORS.primary : '#d97706'}
                      />
                      <Text style={styles.alertText}>
                        {ALERT_STATUS_LABELS[alert.status] ?? alert.status} —{' '}
                        {ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType}
                        {alert.status === 'IN_TRANSIT'
                          ? ` · Entrega ${formatDate(
                              alert.deliveryDate ?? alert.shipmentDestination?.deliveryDate ?? null,
                            )}`
                          : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}

          {(data?.pendingDeliveries ?? []).length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Entregas en camino</Text>
              {(data?.pendingDeliveries ?? []).map((delivery) => (
                <View key={delivery.id} style={styles.card}>
                  <Text style={styles.productName}>{delivery.order.reference}</Text>
                  <Text style={styles.muted}>
                    Entrega prevista: {formatDate(delivery.deliveryDate)}
                  </Text>
                  {delivery.lines.map((line, idx) => (
                    <Text key={idx} style={styles.lineText}>
                      · {line.product.name} × {line.quantity}
                    </Text>
                  ))}
                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      confirmingDeliveryId === delivery.id && styles.confirmBtnBusy,
                    ]}
                    disabled={confirmingDeliveryId != null}
                    onPress={() => void confirmDelivery(delivery)}
                  >
                    {confirmingDeliveryId === delivery.id ? (
                      <>
                        <ActivityIndicator size="small" color="#047857" />
                        <Text style={styles.confirmBtnText}>Confirmando…</Text>
                      </>
                    ) : (
                      <Text style={styles.confirmBtnText}>Confirmar recepción</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}

      <Modal visible={alertModal} animationType="slide" transparent onRequestClose={closeAlertModal}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDismissArea} onPress={closeAlertModal} />
          <View
            style={[
              styles.modal,
              {
                paddingBottom: Math.max(insets.bottom, 16),
                marginBottom: alertModalBottomInset,
              },
            ]}
          >
            <ScrollView
              ref={modalScrollRef}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              bounces={false}
              nestedScrollEnabled
            >
              <Text style={styles.modalTitle}>Reportar alerta</Text>

              <Text style={styles.label}>Producto</Text>
              <View style={styles.productSearchBar}>
                <Ionicons name="search" size={18} color={COLORS.textMuted} />
                <TextInput
                  style={styles.productSearchInput}
                  placeholder="Buscar por nombre o SKU..."
                  placeholderTextColor={COLORS.disabled}
                  value={alertProductSearch}
                  onChangeText={setAlertProductSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {alertProductSearch.trim().length > 0 ? (
                  <TouchableOpacity
                    onPress={() => setAlertProductSearch('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Limpiar búsqueda"
                  >
                    <Ionicons name="close-circle" size={18} color={COLORS.disabled} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {selectedAlertProduct ? (
                <View style={styles.selectedProductChip}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
                  <Text style={styles.selectedProductChipText} numberOfLines={2}>
                    {selectedAlertProduct.product.name}
                    {selectedAlertProduct.product.sku
                      ? ` · ${selectedAlertProduct.product.sku}`
                      : ''}
                  </Text>
                  <Text style={styles.selectedProductQty}>{selectedAlertProduct.quantity}</Text>
                </View>
              ) : (
                <Text style={styles.productSearchHint}>Seleccioná un producto de la lista.</Text>
              )}

              <ScrollView
                style={styles.productPickerList}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {filteredAlertProducts.length === 0 ? (
                  <Text style={styles.productSearchEmpty}>
                    {alertProductSearch.trim()
                      ? `Sin productos para "${alertProductSearch.trim()}"`
                      : 'No hay productos habilitados en este edificio.'}
                  </Text>
                ) : (
                  filteredAlertProducts.map((item) => {
                    const isSelected = alertProductId === item.product.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.productPickerRow,
                          isSelected && styles.productPickerRowActive,
                        ]}
                        onPress={() => {
                          setAlertProductId(item.product.id);
                          Keyboard.dismiss();
                        }}
                      >
                        <View style={styles.productPickerRowMain}>
                          <Text
                            style={[
                              styles.productPickerName,
                              isSelected && styles.productPickerNameActive,
                            ]}
                            numberOfLines={2}
                          >
                            {item.product.name}
                          </Text>
                          {item.product.sku ? (
                            <Text style={styles.productPickerSku}>SKU {item.product.sku}</Text>
                          ) : null}
                        </View>
                        <Text
                          style={[
                            styles.productPickerQty,
                            isSelected && styles.productPickerQtyActive,
                          ]}
                        >
                          {item.quantity}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>

              <Text style={styles.label}>Tipo</Text>
              <View style={styles.typeRow}>
                {(['LOW_STOCK', 'OUT_OF_STOCK', 'OBSERVATION'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeBtn, alertType === type && styles.typeBtnActive]}
                    onPress={() => setAlertType(type)}
                  >
                    <Text
                      style={[styles.typeBtnText, alertType === type && styles.typeBtnTextActive]}
                    >
                      {ALERT_TYPE_LABELS[type]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Observación (opcional)</Text>
              <TextInput
                style={styles.input}
                multiline
                value={alertNote}
                onChangeText={setAlertNote}
                placeholder="Detalle adicional..."
                onFocus={scrollAlertModalToInput}
              />

              <TouchableOpacity style={styles.photoBtn} onPress={() => void pickPhoto()}>
                <Ionicons name="camera-outline" size={18} color={COLORS.primary} />
                <Text style={styles.photoBtnText}>
                  {alertPhoto ? 'Foto adjunta' : 'Adjuntar foto'}
                </Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={closeAlertModal}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, submitting && { opacity: 0.6 }]}
                  disabled={submitting}
                  onPress={() => void submitAlert()}
                >
                  <Text style={styles.saveBtnText}>{submitting ? 'Enviando...' : 'Enviar'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  errorText: { color: '#dc2626', marginBottom: 12 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  productName: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  qty: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  alertText: { flex: 1, fontSize: 12, color: COLORS.textMuted },
  muted: { fontSize: 13, color: COLORS.textMuted },
  lineText: { fontSize: 12, color: COLORS.text, marginTop: 2 },
  confirmBtn: {
    marginTop: 10,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#6ee7b7',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  confirmBtnBusy: {
    opacity: 0.85,
  },
  confirmBtnText: { color: '#047857', fontWeight: '700', fontSize: 13 },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#6ee7b7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  successBannerText: {
    flex: 1,
    color: '#047857',
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginTop: 10, marginBottom: 6 },
  productSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  productSearchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    padding: 0,
  },
  productSearchHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  productSearchEmpty: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  selectedProductChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  selectedProductChipText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  selectedProductQty: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
  },
  productPickerList: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    marginBottom: 4,
  },
  productPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  productPickerRowActive: {
    backgroundColor: '#eff6ff',
  },
  productPickerRowMain: {
    flex: 1,
    gap: 2,
  },
  productPickerName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  productPickerNameActive: {
    color: COLORS.primary,
  },
  productPickerSku: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  productPickerQty: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textMuted,
    minWidth: 28,
    textAlign: 'right',
  },
  productPickerQtyActive: {
    color: COLORS.primary,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeBtnActive: { borderColor: COLORS.primary, backgroundColor: '#eff6ff' },
  typeBtnText: { fontSize: 12, color: COLORS.text },
  typeBtnTextActive: { color: COLORS.primary, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    minHeight: 72,
    textAlignVertical: 'top',
    fontSize: 14,
    color: COLORS.text,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
  },
  photoBtnText: { color: COLORS.primary, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: { color: COLORS.textMuted, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});
