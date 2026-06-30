import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/** Abre la cámara para capturar una foto de tarea en el momento. */
export async function takeTaskPhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Permiso requerido',
      'Necesitamos acceso a la cámara para tomar la foto de la tarea.',
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
