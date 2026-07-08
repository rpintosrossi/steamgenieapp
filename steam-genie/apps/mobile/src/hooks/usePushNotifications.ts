import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../stores/auth.store';
import {
  parseNotificationData,
  registerPushNotifications,
} from '../services/notifications.service';

function navigateFromNotification(
  router: ReturnType<typeof useRouter>,
  data: Record<string, unknown> | undefined,
): void {
  const route = parseNotificationData(data);

  if (route.screen === 'service' && route.workOrderId) {
    router.push(`/service/${route.workOrderId}`);
    return;
  }

  if (route.screen === 'stock') {
    router.push('/(tabs)/stock');
    return;
  }

  if (route.screen === 'tareas') {
    router.push('/(tabs)/tareas');
    return;
  }

  if (route.screen === 'services') {
    router.push('/(tabs)/services');
  }
}

export function usePushNotifications(): void {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  useEffect(() => {
    if (!isHydrated || !accessToken) return;

    void registerPushNotifications().catch((error) => {
      console.warn(
        '[notifications] No se pudo registrar el dispositivo:',
        error instanceof Error ? error.message : error,
      );
    });
  }, [isHydrated, accessToken]);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      // El handler global ya muestra la notificación en foreground.
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateFromNotification(
        router,
        response.notification.request.content.data as Record<string, unknown>,
      );
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      navigateFromNotification(
        router,
        response.notification.request.content.data as Record<string, unknown>,
      );
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [router]);
}
