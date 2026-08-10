import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatQuoteNumber, formatStoredCalendarDate } from '@steam-genie/shared-constants';
import { AuthenticatedImage } from '../../../src/components/AuthenticatedImage';
import { COLORS } from '../../../src/constants/colors';
import {
  adminApi,
  type AdminWorkOrderDetail,
  type ServiceExecutionPhasePhoto,
  type ServiceExecutionTaskItem,
  type ServiceExecutionTaskPhoto,
} from '../../../src/services/admin-api';
import { useAuthenticatedImage } from '../../../src/hooks/useAuthenticatedImage';
import { PdfViewerModal } from '../../../src/components/PdfViewerModal';
import { formatScheduledTime } from '../../../src/utils/schedule';
import { downloadPdfToCache, quotePdfFilename } from '../../../src/utils/download-pdf';

const STATUS_LABELS: Record<string, string> = {
  UNASSIGNED: 'Sin asignar',
  ASSIGNED: 'Asignado',
  ACCEPTED: 'Aceptado',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
};

const PHASE_LABELS: Record<string, string> = {
  BEFORE: 'Antes',
  DURING: 'Durante',
  AFTER: 'Después',
};

const EXEC_STATUS: Record<string, string> = {
  DONE: 'Hecha',
  NOT_DONE: 'No hecha',
  SKIPPED: 'Omitida',
};

type GalleryItem = {
  id: string;
  url: string;
  title: string;
};

function Lightbox({
  item,
  onClose,
}: {
  item: GalleryItem | null;
  onClose: () => void;
}) {
  const source = useAuthenticatedImage(item?.url);
  if (!item) return null;
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.lightbox}>
        <TouchableOpacity style={styles.lightboxClose} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.lightboxTitle}>{item.title}</Text>
        {source ? (
          <Image source={source} style={styles.lightboxImage} resizeMode="contain" />
        ) : (
          <ActivityIndicator color="#fff" />
        )}
      </View>
    </Modal>
  );
}

export default function AdminServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [wo, setWo] = useState<AdminWorkOrderDetail | null>(null);
  const [tasks, setTasks] = useState<ServiceExecutionTaskItem[]>([]);
  const [phasePhotos, setPhasePhotos] = useState<ServiceExecutionPhasePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [pdfTitle, setPdfTitle] = useState('Presupuesto');

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const detail = await adminApi.getWorkOrder(id);
      setWo(detail);
      const se = detail.serviceExecutions?.[0];
      if (!se) {
        setTasks([]);
        setPhasePhotos([]);
        return;
      }
      const [taskItems, phases] = await Promise.all([
        adminApi.getExecutionTasks(se.id),
        adminApi.getPhasePhotos(se.id),
      ]);
      setTasks(taskItems);
      setPhasePhotos(phases);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el servicio');
      setWo(null);
      setTasks([]);
      setPhasePhotos([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const gallery: GalleryItem[] = [];
  for (const photo of phasePhotos) {
    gallery.push({
      id: photo.id,
      url: photo.url,
      title: PHASE_LABELS[photo.phase] ?? photo.phase,
    });
  }
  for (const task of tasks) {
    for (const photo of task.execution?.photos ?? []) {
      gallery.push({
        id: photo.id,
        url: photo.url,
        title: task.nameSnapshot,
      });
    }
  }

  function openPhoto(photo: ServiceExecutionTaskPhoto | ServiceExecutionPhasePhoto, title: string) {
    setLightbox({ id: photo.id, url: photo.url, title });
  }

  async function handleOpenQuotePdf() {
    const quote = wo?.quote;
    const quoteId = quote?.id ?? wo?.quoteId;
    if (!quoteId) {
      Alert.alert('Sin presupuesto', 'Este servicio no tiene un presupuesto asociado.');
      return;
    }

    setDownloadingPdf(true);
    try {
      const filename = quote
        ? quotePdfFilename(quote)
        : `presupuesto-${quoteId.slice(0, 8)}.pdf`;
      const downloaded = await downloadPdfToCache(`/quotes/${quoteId}/pdf`, filename);
      setPdfTitle(
        quote?.number != null
          ? `Presupuesto N° ${formatQuoteNumber(quote.number)}`
          : 'Presupuesto',
      );
      setPdfUri(downloaded.uri);
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'No se pudo abrir el presupuesto',
      );
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Detalle del servicio
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : !wo ? (
        <Text style={styles.errorText}>Servicio no encontrado</Text>
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
          <Text style={styles.title}>{wo.title}</Text>
          <View style={styles.row}>
            <Text style={styles.badge}>{STATUS_LABELS[wo.status] ?? wo.status}</Text>
          </View>
          <Text style={styles.meta}>
            {wo.building?.name}
            {wo.floor?.name ? ` · ${wo.floor.name}` : ''}
            {wo.zone?.name ? ` · ${wo.zone.name}` : ''}
            {wo.subzone?.name ? ` · ${wo.subzone.name}` : ''}
          </Text>
          <Text style={styles.meta}>
            {wo.scheduledDate
              ? formatStoredCalendarDate(wo.scheduledDate, 'es-AR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })
              : 'Sin fecha'}
            {wo.scheduledTime ? ` · ${formatScheduledTime(wo.scheduledTime)}` : ''}
          </Text>

          {(wo.quote?.id || wo.quoteId) && (
            <TouchableOpacity
              style={styles.pdfBtn}
              onPress={() => void handleOpenQuotePdf()}
              disabled={downloadingPdf}
            >
              {downloadingPdf ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={18} color="#fff" />
                  <Text style={styles.pdfBtnText}>
                    Ver presupuesto
                    {wo.quote?.number != null
                      ? ` N° ${formatQuoteNumber(wo.quote.number)}`
                      : ''}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {wo.assignments?.length ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Asignados</Text>
              {wo.assignments.map((a) => (
                <Text key={a.id} style={styles.meta}>
                  {a.user?.fullName ?? a.userId} ({a.status})
                </Text>
              ))}
            </View>
          ) : null}

          {wo.description ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Descripción</Text>
              <Text style={styles.meta}>{wo.description}</Text>
            </View>
          ) : null}

          {phasePhotos.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Fotos por fase</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {phasePhotos.map((photo) => (
                  <TouchableOpacity
                    key={photo.id}
                    onPress={() => openPhoto(photo, PHASE_LABELS[photo.phase] ?? photo.phase)}
                  >
                    <AuthenticatedImage pathOrUrl={photo.url} style={styles.thumb} />
                    <Text style={styles.thumbLabel}>
                      {PHASE_LABELS[photo.phase] ?? photo.phase}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tareas / checklist</Text>
            {tasks.length === 0 ? (
              <Text style={styles.meta}>Sin ejecución o sin tareas registradas</Text>
            ) : (
              tasks.map((task) => (
                <View key={task.workOrderTaskId} style={styles.taskRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskName}>{task.nameSnapshot}</Text>
                    <Text style={styles.meta}>
                      {task.execution
                        ? `${EXEC_STATUS[task.execution.status] ?? task.execution.status} · ${task.execution.executedByName}`
                        : 'Sin registrar'}
                    </Text>
                    {task.execution?.observation ? (
                      <Text style={styles.meta}>{task.execution.observation}</Text>
                    ) : null}
                  </View>
                  {(task.execution?.photos?.length ?? 0) > 0 && (
                    <ScrollView horizontal>
                      {task.execution!.photos.map((photo) => (
                        <TouchableOpacity
                          key={photo.id}
                          onPress={() => openPhoto(photo, task.nameSnapshot)}
                        >
                          <AuthenticatedImage pathOrUrl={photo.url} style={styles.thumbSm} />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              ))
            )}
          </View>

          {gallery.length > 0 && (
            <Text style={styles.footerHint}>{gallery.length} foto(s) en total</Text>
          )}
        </ScrollView>
      )}

      <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
      <PdfViewerModal
        visible={!!pdfUri}
        uri={pdfUri}
        title={pdfTitle}
        onClose={() => setPdfUri(null)}
      />
    </View>
  );
}

const { width: SCREEN_W } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  content: { padding: 16, paddingBottom: 40, gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  row: { flexDirection: 'row', gap: 8 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f0fe',
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  meta: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  pdfBtn: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pdfBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    gap: 6,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  taskRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  taskName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: COLORS.border,
  },
  thumbSm: {
    width: 56,
    height: 56,
    borderRadius: 6,
    marginRight: 6,
    backgroundColor: COLORS.border,
  },
  thumbLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    width: 96,
    textAlign: 'center',
  },
  footerHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 12, textAlign: 'center' },
  errorText: { marginTop: 40, textAlign: 'center', color: COLORS.error, paddingHorizontal: 24 },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  lightboxClose: { position: 'absolute', top: 48, right: 20, zIndex: 2 },
  lightboxTitle: { color: '#fff', marginBottom: 12, fontSize: 14, fontWeight: '600' },
  lightboxImage: { width: SCREEN_W - 32, height: SCREEN_W - 32 },
});
