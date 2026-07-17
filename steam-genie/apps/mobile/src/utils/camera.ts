import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type PhotoPhase = 'BEFORE' | 'DURING' | 'AFTER';

export const PHOTO_PHASE_LABELS: Record<PhotoPhase, string> = {
  BEFORE: 'Antes',
  DURING: 'Durante',
  AFTER: 'Después',
};

export const PHOTO_PHASES: PhotoPhase[] = ['BEFORE', 'DURING', 'AFTER'];

async function launchCamera(): Promise<ImagePicker.ImagePickerAsset | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Permiso requerido',
      'Necesitamos acceso a la cámara para tomar la foto.',
    );
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.6,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0];
}

async function launchGallery(): Promise<ImagePicker.ImagePickerAsset | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Permiso requerido',
      'Necesitamos acceso a la galería para elegir la foto.',
    );
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.6,
    allowsEditing: false,
    selectionLimit: 1,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0];
}

/**
 * Abre un selector para tomar foto con la cámara o elegir de la galería.
 */
export function pickTaskPhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  return new Promise((resolve) => {
    Alert.alert('Agregar foto', 'Elegí el origen de la foto', [
      {
        text: 'Cámara',
        onPress: () => {
          void launchCamera().then(resolve);
        },
      },
      {
        text: 'Galería',
        onPress: () => {
          void launchGallery().then(resolve);
        },
      },
      {
        text: 'Cancelar',
        style: 'cancel',
        onPress: () => resolve(null),
      },
    ]);
  });
}

/** @deprecated Prefer pickTaskPhoto (cámara o galería). */
export async function takeTaskPhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  return pickTaskPhoto();
}
