import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { apiService } from './api.service';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function isNotificationsGranted(
  permissions: Notifications.NotificationPermissionsStatus,
): boolean {
  const value = permissions as Notifications.NotificationPermissionsStatus & {
    granted?: boolean;
    status?: string;
  };
  return value.granted === true || value.status === 'granted';
}

async function getStableDeviceId(): Promise<string> {
  if (Platform.OS === 'android') {
    const androidId = Application.getAndroidId();
    if (androidId) return androidId;
  }

  if (Platform.OS === 'ios') {
    const iosId = await Application.getIosIdForVendorAsync();
    if (iosId) return iosId;
  }

  return Constants.installationId ?? `${Platform.OS}-${Date.now()}`;
}

export async function resolveDeviceId(): Promise<string> {
  return getStableDeviceId();
}

export async function registerPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = isNotificationsGranted(existing);
  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = isNotificationsGranted(requested);
  }
  if (!granted) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Steam Genie',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2f6fed',
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('[notifications] EAS projectId no configurado');
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const deviceId = await resolveDeviceId();

  await apiService.post('/users/me/devices', {
    deviceId,
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
    pushToken: token.data,
    appVersion: Application.nativeApplicationVersion ?? undefined,
  });

  return token.data;
}

export type NotificationRouteData = {
  screen?: string;
  workOrderId?: string;
  alertId?: string;
  buildingId?: string;
};

export function parseNotificationData(
  data: Record<string, unknown> | undefined,
): NotificationRouteData {
  if (!data) return {};
  return {
    screen: typeof data.screen === 'string' ? data.screen : undefined,
    workOrderId: typeof data.workOrderId === 'string' ? data.workOrderId : undefined,
    alertId: typeof data.alertId === 'string' ? data.alertId : undefined,
    buildingId: typeof data.buildingId === 'string' ? data.buildingId : undefined,
  };
}

