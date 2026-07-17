import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import {
  PHOTO_PHASE_LABELS,
  PHOTO_PHASES,
  type PhotoPhase,
} from '../utils/camera';

export interface PhasePhotoItem {
  id: string;
  phase: PhotoPhase;
  url: string;
}

type PhasePhotosSectionProps = {
  photos: PhasePhotoItem[];
  canEdit: boolean;
  uploadingPhase: PhotoPhase | null;
  /** Progreso opcional al subir varias fotos, ej. "2/5". */
  uploadingProgress?: string | null;
  onAddPhoto: (phase: PhotoPhase) => void;
  onDeletePhoto?: (photo: PhasePhotoItem) => void;
  deletingPhotoId?: string | null;
  title?: string;
  compact?: boolean;
};

export function PhasePhotosSection({
  photos,
  canEdit,
  uploadingPhase,
  uploadingProgress = null,
  onAddPhoto,
  onDeletePhoto,
  deletingPhotoId = null,
  title = 'Evidencia fotográfica',
  compact = false,
}: PhasePhotosSectionProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.8}
      >
        <Ionicons name="images-outline" size={20} color={COLORS.primary} />
        <Text style={styles.title}>{title}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.phases}>
          {PHOTO_PHASES.map((phase) => {
            const phasePhotos = photos.filter((p) => p.phase === phase);
            const isUploading = uploadingPhase === phase;
            const hasPhotos = phasePhotos.length > 0;

            return (
              <View key={phase} style={styles.phaseBlock}>
                <View style={styles.phaseHeader}>
                  <Text style={styles.phaseLabel}>{PHOTO_PHASE_LABELS[phase]}</Text>
                  {hasPhotos ? (
                    <View style={styles.okBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                      <Text style={styles.okBadgeText}>{phasePhotos.length}</Text>
                    </View>
                  ) : (
                    <Text style={styles.missingBadge}>Falta</Text>
                  )}
                </View>

                {phasePhotos.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.photoRow}
                  >
                    {phasePhotos.map((photo) => {
                      const isDeleting = deletingPhotoId === photo.id;
                      return (
                        <View key={photo.id} style={styles.thumbWrap}>
                          <Image
                            source={{ uri: photo.url }}
                            style={[styles.thumb, isDeleting && styles.thumbDeleting]}
                          />
                          {canEdit && onDeletePhoto && !isUploading ? (
                            <TouchableOpacity
                              style={styles.deleteBtn}
                              onPress={() => onDeletePhoto(photo)}
                              disabled={isDeleting}
                              hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                              accessibilityLabel="Eliminar foto"
                            >
                              {isDeleting ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Ionicons name="close" size={10} color="#fff" />
                              )}
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      );
                    })}
                  </ScrollView>
                ) : null}

                {canEdit ? (
                  isUploading ? (
                    <View style={styles.uploadingRow}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text style={styles.uploadingText}>
                        {uploadingProgress
                          ? `Subiendo ${uploadingProgress}…`
                          : 'Subiendo…'}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={() => onAddPhoto(phase)}
                    >
                      <Ionicons name="images-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.addBtnText}>Agregar fotos</Text>
                    </TouchableOpacity>
                  )
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function hasAllPhasePhotos(photos: PhasePhotoItem[]): boolean {
  return PHOTO_PHASES.every((phase) => photos.some((p) => p.phase === phase));
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  containerCompact: {
    marginHorizontal: 0,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.bg,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  phases: {
    padding: 12,
    gap: 12,
  },
  phaseBlock: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phaseLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  okBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  okBadgeText: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '600',
  },
  missingBadge: {
    fontSize: 12,
    color: COLORS.warning,
    fontWeight: '600',
  },
  photoRow: {
    flexGrow: 0,
  },
  thumbWrap: {
    position: 'relative',
    marginRight: 8,
    width: 64,
    height: 64,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: COLORS.border,
  },
  thumbDeleting: {
    opacity: 0.5,
  },
  deleteBtn: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(220, 38, 38, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
  },
  addBtnText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  uploadingText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
});
