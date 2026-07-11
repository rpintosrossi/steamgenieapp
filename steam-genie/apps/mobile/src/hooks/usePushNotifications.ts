import { useCallback, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useAuthStore } from '../stores/auth.store';
import { useBuildingStore } from '../stores/building.store';
import {
  parseNotificationData,
  registerPushNotifications,
  type NotificationRouteData,
} from '../services/notifications.service';

function performNavigation(
  router: ReturnType<typeof useRouter>,
  route: NotificationRouteData,
): void {
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

// Evita re-navegar a la misma notificación en cada arranque en frío,
// porque getLastNotificationResponseAsync devuelve siempre la última respuesta.
const handledResponseIds = new Set<string>();

export function usePushNotifications(): void {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const selectedBuilding = useBuildingStore((state) => state.selectedBuilding);
  const rootNavigationState = useRootNavigationState();
  const navigationReady = rootNavigationState?.key != null;

  const pendingRouteRef = useRef<NotificationRouteData | null>(null);

  const readyToNavigate =
    isHydrated && Boolean(accessToken) && Boolean(selectedBuilding) && navigationReady;

  useEffect(() => {
    if (!isHydrated || !accessToken) return;

    void registerPushNotifications().catch((error) => {
      console.warn(
        '[notifications] No se pudo registrar el dispositivo:',
        error instanceof Error ? error.message : error,
      );
    });
  }, [isHydrated, accessToken]);

  const flushPending = useCallback(() => {
    if (!readyToNavigate) return;
    const route = pendingRouteRef.current;
    if (!route || !route.screen) return;
    pendingRouteRef.current = null;
    performNavigation(router, route);
  }, [readyToNavigate, router]);

  const queueResponse = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (id) {
        if (handledResponseIds.has(id)) return;
        handledResponseIds.add(id);
      }
      pendingRouteRef.current = parseNotificationData(
        response.notification.request.content.data as Record<string, unknown>,
      );
      flushPending();
    },
    [flushPending],
  );

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      // El handler global ya muestra la notificación en foreground.
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener(queueResponse);

    void Notifications.getLastNotificationResponseAsync().then(queueResponse);

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [queueResponse]);

  // Cuando la app termina de hidratarse / seleccionar edificio / montar el
  // router, procesamos la navegación pendiente que dejó la notificación.
  useEffect(() => {
    flushPending();
  }, [flushPending]);
}
