import { useEffect } from 'react';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { useAuthStore } from '../src/stores/auth.store';
import { useBuildingStore } from '../src/stores/building.store';
import { useSyncStore } from '../src/stores/sync.store';
import { syncManager } from '../src/sync/sync-manager';
import { initDatabase } from '../src/db/database';
import { COLORS } from '../src/constants/colors';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { isAdminUser } from '../src/utils/roles';

export default function RootLayout() {
  const { accessToken, isHydrated, hydrate, user } = useAuthStore();
  const { selectedBuilding, restoreBuilding, loadPrefetch } = useBuildingStore();
  const { setStatus } = useSyncStore();
  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();
  const navigationReady = rootNavigationState?.key != null;
  const admin = isAdminUser(user);

  usePushNotifications();

  // ── 1. Hydrate auth + init DB on mount ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      await initDatabase();
      await hydrate();
    })();
  }, []);

  // ── 2. After auth is hydrated, try to restore saved building (operativos) ──
  useEffect(() => {
    if (!isHydrated || !accessToken || admin) return;
    (async () => {
      const savedBuildingId = await restoreBuilding();
      if (savedBuildingId) {
        await loadPrefetch(savedBuildingId);
      }
    })();
  }, [isHydrated, accessToken, admin]);

  // ── 3. Navigation guard ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isHydrated || !navigationReady) return;

    const inAuth = segments[0] === '(auth)';
    const inBuildingSelect = segments[0] === 'building-select';
    const inAdminTabs = segments[0] === '(admin-tabs)';
    const inAdminDetail = segments[0] === 'admin';
    const inOpsTabs = segments[0] === '(tabs)';
    const inServiceDetail = segments[0] === 'service';

    if (!accessToken) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }

    // Admin: panel de consulta, sin edificio obligatorio
    if (admin) {
      if (!inAdminTabs && !inAdminDetail) {
        router.replace('/(admin-tabs)/calendario');
      }
      return;
    }

    // No-admin no debe quedar en rutas admin
    if (inAdminTabs || inAdminDetail) {
      if (!selectedBuilding) {
        router.replace('/building-select');
      } else {
        router.replace('/(tabs)');
      }
      return;
    }

    // Logged in but no building selected
    if (!selectedBuilding) {
      if (!inBuildingSelect) router.replace('/building-select');
      return;
    }

    // Logged in + building selected → go to tabs (leave service detail alone)
    if (inAuth || inBuildingSelect) {
      router.replace('/(tabs)');
      return;
    }

    // Stay on ops tabs / service detail
    if (!inOpsTabs && !inServiceDetail && !inBuildingSelect) {
      // no-op for unknown routes; tabs/service handled by stack
    }
  }, [
    accessToken,
    isHydrated,
    selectedBuilding,
    segments,
    navigationReady,
    admin,
    user,
  ]);

  // ── 4. NetInfo listener — sync when reconnected ───────────────────────────
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? false;
      if (!connected) {
        setStatus('offline');
        return;
      }

      setStatus('synced');

      // If there's a logged-in session, run sync on reconnect
      void useAuthStore
        .getState()
        .ensureAccessToken()
        .then((token) => {
          if (token && !isAdminUser(useAuthStore.getState().user)) {
            syncManager.syncAll().catch(() => {});
            syncManager.refreshPendingCount().catch(() => {});
          }
        });
    });
    return unsubscribe;
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={COLORS.bg} />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
