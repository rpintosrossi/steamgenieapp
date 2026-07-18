import type { ExpoConfig } from 'expo/config';

export default (): ExpoConfig => ({
  name: 'Steam Genie',
  slug: 'steam-genie',
  owner: 'rpintosrossi',
  version: '1.0.1',
  orientation: 'portrait',
  scheme: 'steamgenie',
  platforms: ['ios', 'android'],
  userInterfaceStyle: 'light',
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
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#2f6fed',
        defaultChannel: 'default',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Steam Genie necesita tu ubicación para registrar el fichaje en el edificio.',
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
  ios: {
    bundleIdentifier: 'com.steamgenie.app',
    buildNumber: '15',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        'Steam Genie necesita tu ubicación para registrar el fichaje en el edificio.',
      NSCameraUsageDescription:
        'Steam Genie necesita acceso a la cámara para tomar fotos de las tareas.',
      NSPhotoLibraryUsageDescription:
        'Steam Genie necesita acceso a tu galería para adjuntar fotos a las tareas.',
    },
  },
  android: {
    package: 'com.steamgenie.app',
    googleServicesFile: './google-services.json',
    versionCode: 15,
    usesCleartextTraffic: true,
    softwareKeyboardLayoutMode: 'resize',
    permissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.CAMERA',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.POST_NOTIFICATIONS',
    ],
  },
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://steamgenie.up.railway.app',
    eas: {
      projectId: 'cd1d9957-f6a4-476e-974a-1f318e0a4947',
    },
  },
});
