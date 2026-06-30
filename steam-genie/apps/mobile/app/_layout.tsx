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

export default function RootLayout() {
  const { accessToken, isHydrated, hydrate } = useAuthStore();
  const { selectedBuilding, restoreBuilding, loadPrefetch } = useBuildingStore();
  const { setStatus } = useSyncStore();
  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();
  const navigationReady = rootNavigationState?.key != null;

  // ── 1. Hydrate auth + init DB on mount ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      await initDatabase();
      await hydrate();
    })();
  }, []);

  // ── 2. After auth is hydrated, try to restore saved building ───────────────
  useEffect(() => {
    if (!isHydrated || !accessToken) return;
    (async () => {
      const savedBuildingId = await restoreBuilding();
      if (savedBuildingId) {
        await loadPrefetch(savedBuildingId);
      }
    })();
  }, [isHydrated, accessToken]);

  // ── 3. Navigation guard ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isHydrated || !navigationReady) return;

    const inAuth = segments[0] === '(auth)';
    const inBuildingSelect = segments[0] === 'building-select';

    if (!accessToken) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }

    // Logged in but no building selected
    if (!selectedBuilding) {
      if (!inBuildingSelect) router.replace('/building-select');
      return;
    }

    // Logged in + building selected → go to tabs
    if (inAuth || inBuildingSelect) {
      router.replace('/(tabs)');
    }
  }, [accessToken, isHydrated, selectedBuilding, segments, navigationReady]);

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
          if (token) {
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
