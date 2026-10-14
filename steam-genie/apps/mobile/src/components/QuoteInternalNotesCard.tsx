import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatQuoteNumber } from '@steam-genie/shared-constants';
import { AuthenticatedImage } from './AuthenticatedImage';
import { PhotoGalleryModal, type PhotoGalleryItem } from './PhotoGalleryModal';
import { COLORS } from '../constants/colors';

export type QuoteInternalPhotoItem = {
  id: string;
  url: string;
  originalFilename?: string | null;
};

type Props = {
  notes?: string | null;
  photos?: QuoteInternalPhotoItem[] | null;
  quoteNumber?: number | null;
};

export function QuoteInternalNotesCard({ notes, photos, quoteNumber }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const text = notes?.trim() ?? '';
  const items = photos ?? [];
  if (!text && items.length === 0) return null;

  const gallery: PhotoGalleryItem[] = items.map((photo) => ({
    id: photo.id,
    url: photo.url,
    title: photo.originalFilename?.trim() || 'Observación interna',
  }));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Observaciones internas</Text>
      <Text style={styles.hint}>
        {quoteNumber != null
          ? `Presupuesto N° ${formatQuoteNumber(quoteNumber)}. `
          : ''}
        Solo para el equipo. No se envían al cliente.
      </Text>
      {text ? <Text style={styles.notes}>{text}</Text> : null}
      {items.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
          {items.map((photo, index) => (
            <TouchableOpacity key={photo.id} onPress={() => setLightboxIndex(index)}>
              <AuthenticatedImage pathOrUrl={photo.url} style={styles.thumb} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
      {lightboxIndex != null && gallery.length > 0 ? (
        <PhotoGalleryModal
          items={gallery}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  hint: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },
  notes: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  row: { marginTop: 4 },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: COLORS.border,
  },
});
