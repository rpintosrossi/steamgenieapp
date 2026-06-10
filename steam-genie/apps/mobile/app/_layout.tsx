import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { useAuthStore } from '../src/stores/auth.store';
import { useBuildingStore } from '../src/stores/building.store';
import { useSyncStore } from '../src/stores/sync.store';
import { syncManager } from '../src/sync/sync-manager';
import { initDatabase } from '../src/db/database';

export default function RootLayout() {
  const { accessToken, isHydrated, hydrate } = useAuthStore();
  const { selectedBuilding, restoreBuilding, loadPrefetch } = useBuildingStore();
  const { setStatus } = useSyncStore();
  const router = useRouter();
  const segments = useSegments();

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
    if (!isHydrated) return;

    const inAuth = segments[0] === '(auth)';
    const inBuildingSelect = segments[0] === 'building-select';
    const inTabs = segments[0] === '(tabs)';

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
      router.replace('/(tabs)/');
    }
  }, [accessToken, isHydrated, selectedBuilding, segments]);

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
      const token = useAuthStore.getState().accessToken;
      if (token) {
        syncManager.syncAll(token).catch(() => {});
        syncManager.refreshPendingCount().catch(() => {});
      }
    });
    return unsubscribe;
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
