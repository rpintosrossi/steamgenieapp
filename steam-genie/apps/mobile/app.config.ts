import type { ExpoConfig } from 'expo/config';

export default (): ExpoConfig => ({
  name: 'Steam Genie',
  slug: 'steam-genie',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'steamgenie',
  platforms: ['ios', 'android'],
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/images/logo-fondoazul.jpeg',
    resizeMode: 'contain',
    backgroundColor: '#0a1628',
  },
  icon: './assets/images/logo-sinletras.png',
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Steam Genie necesita tu ubicación para registrar el fichaje en el edificio.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Steam Genie necesita acceso a tu galería para adjuntar fotos a las tareas.',
        cameraPermission:
          'Steam Genie necesita acceso a la cámara para tomar fotos de las tareas.',
      },
    ],
    'expo-font',
    'expo-sqlite',
  ],
  android: {
    package: 'com.steamgenie.app',
    versionCode: 1,
    permissions: [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.CAMERA',
      'android.permission.READ_EXTERNAL_STORAGE',
    ],
  },
  experiments: {
    typedRoutes: true,
  },
});
