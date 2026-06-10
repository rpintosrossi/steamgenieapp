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
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { apiService } from '../../../src/services/api.service';
import { syncQueue, photoQueue, generateClientId } from '../../../src/sync/sync-queue';
import { useNetworkStatus } from '../../../src/hooks/useNetworkStatus';
import { useSyncStore } from '../../../src/stores/sync.store';
import { COLORS } from '../../../src/constants/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskExecution {
  id: string;
  workOrderTaskId: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'NOT_DONE' | 'NA';
  observation: string | null;
  rejectionReasonId: string | null;
  photos: Array<{ id: string; url: string }>;
  workOrderTask: {
    id: string;
    nameSnapshot: string;
    sortOrder: number;
    requiresPhotoSnapshot: boolean;
    allowsObservationSnapshot: boolean;
    requiresRejectionReasonSnapshot: boolean;
  };
}

interface TasksResponse {
  tasks: TaskExecution[];
}

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Sin iniciar',
  IN_PROGRESS: 'En progreso',
  DONE: 'Realizada',
  NOT_DONE: 'No realizada',
  NA: 'N/A',
};

const STATUS_ICONS: Record<string, { name: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string }> = {
  NOT_STARTED: { name: 'ellipse-outline', color: COLORS.disabled },
  IN_PROGRESS: { name: 'time-outline', color: COLORS.warning },
  DONE: { name: 'checkmark-circle', color: COLORS.success },
  NOT_DONE: { name: 'close-circle', color: COLORS.error },
  NA: { name: 'remove-circle-outline', color: COLORS.disabled },
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChecklistScreen() {
  const { id: workOrderId, seId } = useLocalSearchParams<{ id: string; seId: string }>();
  const router = useRouter();
  const { isConnected } = useNetworkStatus();
  const isOnline = isConnected ?? true;
  const { setStatus } = useSyncStore();

  const [tasks, setTasks] = useState<TaskExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [markingTaskId, setMarkingTaskId] = useState<string | null>(null);
  const [uploadingPhotoForWotId, setUploadingPhotoForWotId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!seId) return;
    setIsLoading(true);
    try {
      const data = await apiService.get<TasksResponse>(`/service-executions/${seId}/tasks`);
      setTasks(data.tasks);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudieron cargar las tareas');
    } finally {
      setIsLoading(false);
    }
  }, [seId]);

  useEffect(() => {
    if (seId) loadTasks();
  }, [seId]);

  // ── Mark task ──────────────────────────────────────────────────────────────

  async function markTask(task: TaskExecution, newStatus: 'DONE' | 'NOT_DONE') {
    if (!seId) return;
    setMarkingTaskId(task.id);
    try {
      const clientOperationId = generateClientId();
      const occurredAt = new Date().toISOString();

      if (isOnline) {
        const updated = await apiService.put<TaskExecution>(
          `/service-executions/${seId}/work-order-tasks/${task.workOrderTaskId}`,
          { status: newStatus, clientOperationId },
        );
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, ...updated } : t)),
        );

        // If DONE and requiresPhoto, prompt immediately for photo
        if (newStatus === 'DONE' && task.workOrderTask.requiresPhotoSnapshot) {
          await handlePhotoUpload(task, seId);
        }
      } else {
        await syncQueue.enqueue({
          id: generateClientId(),
          clientOperationId,
          operationType: 'MARK_WORK_ORDER_TASK',
          entityType: 'WORK_ORDER_TASK',
          entityId: task.workOrderTaskId,
          payload: {
            serviceExecutionId: seId,
            workOrderTaskId: task.workOrderTaskId,
            status: newStatus,
            deviceId: 'mobile',
          },
          occurredAt,
        });
        // Optimistic update
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)),
        );
        setStatus('pending');

        if (newStatus === 'DONE' && task.workOrderTask.requiresPhotoSnapshot) {
          await handlePhotoQueueOffline(task, seId);
        }
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo marcar la tarea');
    } finally {
      setMarkingTaskId(null);
    }
  }

  // ── Photo upload (online) ──────────────────────────────────────────────────

  async function handlePhotoUpload(task: TaskExecution, seIdParam: string) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploadingPhotoForWotId(task.workOrderTaskId);
    try {
      // Get GPS for the photo
      let gpsLat: number | undefined;
      let gpsLng: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          gpsLat = loc.coords.latitude;
          gpsLng = loc.coords.longitude;
        }
      } catch {
        // GPS optional for photos
      }

      const formData = new FormData();
      formData.append('photo', {
        uri: asset.uri,
        name: asset.fileName ?? `photo_${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
      formData.append('clientOperationId', generateClientId());
      formData.append('capturedAt', new Date().toISOString());
      if (gpsLat != null) formData.append('gpsLat', String(gpsLat));
      if (gpsLng != null) formData.append('gpsLng', String(gpsLng));

      await apiService.postMultipart(
        `/service-executions/${seIdParam}/work-order-tasks/${task.workOrderTaskId}/photos`,
        formData,
      );

      // Refresh task to show new photo
      await loadTasks();
    } catch (e) {
      Alert.alert('Error al subir foto', e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setUploadingPhotoForWotId(null);
    }
  }

  // ── Photo queue (offline) ──────────────────────────────────────────────────

  async function handlePhotoQueueOffline(task: TaskExecution, seIdParam: string) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const clientOperationId = generateClientId();

    let gpsLat: number | undefined;
    let gpsLng: number | undefined;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        gpsLat = loc.coords.latitude;
        gpsLng = loc.coords.longitude;
      }
    } catch {
      // GPS optional
    }

    await photoQueue.enqueue({
      id: generateClientId(),
      clientOperationId,
      serviceExecutionId: seIdParam,
      workOrderTaskId: task.workOrderTaskId,
      localUri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      capturedAt: new Date().toISOString(),
      gpsLat: gpsLat ?? null,
      gpsLng: gpsLng ?? null,
      deviceId: 'mobile',
    });

    setStatus('pending');
    Alert.alert('Foto guardada', 'La foto se subirá cuando recuperes conexión.');
  }

  // ── Quick photo add (for already-DONE tasks) ──────────────────────────────

  async function addPhoto(task: TaskExecution) {
    if (!seId) return;
    if (isOnline) {
      await handlePhotoUpload(task, seId);
    } else {
      await handlePhotoQueueOffline(task, seId);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const doneCount = tasks.filter((t) => t.status === 'DONE').length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? doneCount / totalCount : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checklist</Text>
        {!isOnline && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineBadgeText}>Modo sin conexión</Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>{doneCount} / {totalCount} tareas completadas</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={loadTasks} />
          }
        >
          {tasks
            .sort((a, b) => a.workOrderTask.sortOrder - b.workOrderTask.sortOrder)
            .map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isMarking={markingTaskId === task.id}
                isUploadingPhoto={uploadingPhotoForWotId === task.workOrderTaskId}
                onMarkDone={() => markTask(task, 'DONE')}
                onMarkNotDone={() => markTask(task, 'NOT_DONE')}
                onAddPhoto={() => addPhoto(task)}
              />
            ))}

          {tasks.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="list-outline" size={48} color={COLORS.disabled} />
              <Text style={styles.emptyText}>No hay tareas en este checklist</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── TaskCard component ───────────────────────────────────────────────────────

interface TaskCardProps {
  task: TaskExecution;
  isMarking: boolean;
  isUploadingPhoto: boolean;
  onMarkDone: () => void;
  onMarkNotDone: () => void;
  onAddPhoto: () => void;
}

function TaskCard({ task, isMarking, isUploadingPhoto, onMarkDone, onMarkNotDone, onAddPhoto }: TaskCardProps) {
  const { workOrderTask, status, photos } = task;
  const iconConfig = STATUS_ICONS[status] ?? STATUS_ICONS.NOT_STARTED;
  const isDone = status === 'DONE';
  const isNotDone = status === 'NOT_DONE';
  const needsPhoto = workOrderTask.requiresPhotoSnapshot && isDone && photos.length === 0;

  return (
    <View style={[styles.taskCard, isDone && styles.taskCardDone, isNotDone && styles.taskCardNotDone]}>
      <View style={styles.taskHeader}>
        <Ionicons name={iconConfig.name} size={22} color={iconConfig.color} />
        <View style={styles.taskInfo}>
          <Text style={styles.taskName}>{workOrderTask.nameSnapshot}</Text>
          <Text style={[styles.taskStatus, { color: iconConfig.color }]}>
            {STATUS_LABELS[status]}
          </Text>
        </View>
        {workOrderTask.requiresPhotoSnapshot && (
          <Ionicons name="camera-outline" size={16} color={COLORS.primary} />
        )}
      </View>

      {/* Photos */}
      {photos.length > 0 && (
        <ScrollView horizontal style={styles.photoRow} showsHorizontalScrollIndicator={false}>
          {photos.map((photo) => (
            <Image key={photo.id} source={{ uri: photo.url }} style={styles.photoThumb} />
          ))}
        </ScrollView>
      )}

      {/* Warning: needs photo */}
      {needsPhoto && (
        <View style={styles.photoWarning}>
          <Ionicons name="warning-outline" size={14} color={COLORS.warning} />
          <Text style={styles.photoWarningText}>Esta tarea requiere foto</Text>
        </View>
      )}

      {/* Actions */}
      {isMarking ? (
        <ActivityIndicator color={COLORS.primary} style={styles.taskLoader} />
      ) : (
        <View style={styles.taskActions}>
          {status !== 'DONE' && (
            <TouchableOpacity style={[styles.taskBtn, styles.taskBtnDone]} onPress={onMarkDone}>
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={styles.taskBtnText}>Realizada</Text>
            </TouchableOpacity>
          )}
          {status !== 'NOT_DONE' && status !== 'NOT_STARTED' && (
            <TouchableOpacity style={[styles.taskBtn, styles.taskBtnNotDone]} onPress={onMarkNotDone}>
              <Ionicons name="close" size={16} color="#fff" />
              <Text style={styles.taskBtnText}>No realizada</Text>
            </TouchableOpacity>
          )}
          {isDone && (
            isUploadingPhoto ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : (
              <TouchableOpacity style={[styles.taskBtn, styles.taskBtnPhoto]} onPress={onAddPhoto}>
                <Ionicons name="camera-outline" size={16} color={COLORS.primary} />
                <Text style={[styles.taskBtnText, { color: COLORS.primary }]}>Foto</Text>
              </TouchableOpacity>
            )
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 20, paddingTop: 60, backgroundColor: COLORS.primary, gap: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  backText: { color: '#fff', fontSize: 14, marginLeft: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  offlineBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.warning,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 4,
  },
  offlineBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  progressContainer: {
    backgroundColor: COLORS.surface,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 6,
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.success, borderRadius: 3 },
  progressText: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  empty: { padding: 48, alignItems: 'center', gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  taskCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    gap: 8,
  },
  taskCardDone: { borderLeftWidth: 3, borderLeftColor: COLORS.success },
  taskCardNotDone: { borderLeftWidth: 3, borderLeftColor: COLORS.error },
  taskHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  taskInfo: { flex: 1 },
  taskName: { fontSize: 14, fontWeight: '600', color: COLORS.text, lineHeight: 20 },
  taskStatus: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  photoRow: { marginTop: 4 },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 6,
    marginRight: 8,
    backgroundColor: COLORS.border,
  },
  photoWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fffbeb',
    borderRadius: 6,
    padding: 8,
  },
  photoWarningText: { fontSize: 12, color: COLORS.warning, fontWeight: '500' },
  taskActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  taskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  taskBtnDone: { backgroundColor: COLORS.success },
  taskBtnNotDone: { backgroundColor: COLORS.error },
  taskBtnPhoto: { borderWidth: 1, borderColor: COLORS.primary, backgroundColor: '#eff6ff' },
  taskBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  taskLoader: { alignSelf: 'center', padding: 8 },
});
