import { create } from 'zustand';

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'syncing' | 'error';

interface SyncStore {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  errorMessage: string | null;

  setStatus: (status: SyncStatus) => void;
  setPendingCount: (count: number) => void;
  setLastSynced: () => void;
  setError: (message: string) => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  status: 'synced',
  pendingCount: 0,
  lastSyncedAt: null,
  errorMessage: null,

  setStatus: (status) => set({ status, errorMessage: null }),
  setPendingCount: (count) => set({ pendingCount: count }),
  setLastSynced: () => set({ lastSyncedAt: new Date().toISOString(), status: 'synced' }),
  setError: (message) => set({ status: 'error', errorMessage: message }),
}));
