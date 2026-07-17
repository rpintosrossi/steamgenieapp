import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type PhotoPhase = 'BEFORE' | 'DURING' | 'AFTER';

export const PHOTO_PHASE_LABELS: Record<PhotoPhase, string> = {
  BEFORE: 'Antes',
  DURING: 'Durante',
  AFTER: 'Después',
};

export const PHOTO_PHASES: PhotoPhase[] = ['BEFORE', 'DURING', 'AFTER'];

/** Máximo de fotos que se pueden elegir de la galería en una sola vez (modo BDA). */
export const MAX_PHASE_PHOTOS_PER_PICK = 10;

async function launchCamera(): Promise<ImagePicker.ImagePickerAsset[]> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Permiso requerido',
      'Necesitamos acceso a la cámara para tomar la foto.',
    );
    return [];
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.6,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) return [];
  return [result.assets[0]];
}

async function launchGallery(
  selectionLimit: number,
): Promise<ImagePicker.ImagePickerAsset[]> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Permiso requerido',
      'Necesitamos acceso a la galería para elegir la foto.',
    );
    return [];
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.6,
    allowsEditing: false,
    allowsMultipleSelection: selectionLimit > 1,
    selectionLimit,
  });

  if (result.canceled || !result.assets?.length) return [];
  return result.assets;
}

function pickPhotosAlert(
  title: string,
  subtitle: string,
  selectionLimit: number,
): Promise<ImagePicker.ImagePickerAsset[]> {
  return new Promise((resolve) => {
    Alert.alert(title, subtitle, [
      {
        text: 'Cámara',
        onPress: () => {
          void launchCamera().then(resolve);
        },
      },
      {
        text: 'Galería',
        onPress: () => {
          void launchGallery(selectionLimit).then(resolve);
        },
      },
      {
        text: 'Cancelar',
        style: 'cancel',
        onPress: () => resolve([]),
      },
    ]);
  });
}

/**
 * Una sola foto (modo por tarea / compatibilidad).
 */
export async function pickTaskPhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  const assets = await pickPhotosAlert(
    'Agregar foto',
    'Elegí el origen de la foto',
    1,
  );
  return assets[0] ?? null;
}

/**
 * Varias fotos desde galería (o una desde cámara). Pensado para modo antes/durante/después.
 */
export function pickTaskPhotos(
  maxCount: number = MAX_PHASE_PHOTOS_PER_PICK,
): Promise<ImagePicker.ImagePickerAsset[]> {
  const limit = Math.max(1, Math.min(maxCount, MAX_PHASE_PHOTOS_PER_PICK));
  return pickPhotosAlert(
    'Agregar fotos',
    limit > 1
      ? `Podés elegir hasta ${limit} fotos de la galería, o tomar una con la cámara.`
      : 'Elegí el origen de la foto',
    limit,
  );
}

/** @deprecated Prefer pickTaskPhoto (cámara o galería). */
export async function takeTaskPhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  return pickTaskPhoto();
}
