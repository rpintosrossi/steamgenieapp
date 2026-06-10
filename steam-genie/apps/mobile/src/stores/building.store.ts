import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { apiService } from '../services/api.service';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Building {
  id: string;
  name: string;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  gpsRadiusM: number;
}

export interface RejectionReason {
  id: string;
  text: string;
  type: string;
}

export interface WorkOrderTaskSnapshot {
  id: string;
  nameSnapshot: string;
  sortOrder: number;
  requiresPhotoSnapshot: boolean;
  allowsObservationSnapshot: boolean;
  requiresRejectionReasonSnapshot: boolean;
}

export interface ServiceExecutionSummary {
  id: string;
  workOrderId: string;
  status: string;
  startedAt: string;
  participants: { userId: string; joinedAt: string }[];
}

export interface WorkOrderCached {
  id: string;
  status: string;
  type: string;
  title: string;
  description: string | null;
  scheduledDate: string | null;
  buildingId: string;
  version: number;
  workOrderTasks: WorkOrderTaskSnapshot[];
  assignments: { userId: string; status: string }[];
}

export interface AttendanceCached {
  id: string;
  buildingId: string;
  checkInAt: string;
  checkInGpsLat: string | null;
  checkInGpsLng: string | null;
  version: number;
}

export interface PrefetchData {
  serverTime: string;
  building: Building;
  floors: { id: string; name: string; sortOrder: number }[];
  zones: { id: string; name: string; floorId: string }[];
  subzones: { id: string; name: string; zoneId: string }[];
  workOrders: WorkOrderCached[];
  serviceExecutions: ServiceExecutionSummary[];
  activeAttendance: AttendanceCached | null;
  rejectionReasons: RejectionReason[];
  periodicTasks: unknown[];
}

// ─── Store ────────────────────────────────────────────────────────────────────

const SELECTED_BUILDING_KEY = 'sg_selected_building_id';

interface BuildingStore {
  selectedBuilding: Building | null;
  prefetchData: PrefetchData | null;
  isLoadingPrefetch: boolean;
  prefetchError: string | null;

  selectBuilding: (building: Building) => Promise<void>;
  loadPrefetch: (buildingId: string) => Promise<void>;
  refreshPrefetch: () => Promise<void>;
  clearBuilding: () => Promise<void>;
  restoreBuilding: () => Promise<string | null>;
  updateActiveAttendance: (attendance: AttendanceCached | null) => void;
}

export const useBuildingStore = create<BuildingStore>((set, get) => ({
  selectedBuilding: null,
  prefetchData: null,
  isLoadingPrefetch: false,
  prefetchError: null,

  selectBuilding: async (building) => {
    await SecureStore.setItemAsync(SELECTED_BUILDING_KEY, building.id);
    set({ selectedBuilding: building });
    await get().loadPrefetch(building.id);
  },

  loadPrefetch: async (buildingId) => {
    set({ isLoadingPrefetch: true, prefetchError: null });
    try {
      const data = await apiService.get<PrefetchData>(
        `/sync/prefetch?buildingId=${buildingId}`,
      );
      set({ prefetchData: data, selectedBuilding: data.building, isLoadingPrefetch: false });
    } catch (e) {
      set({
        prefetchError: e instanceof Error ? e.message : 'Error al cargar datos',
        isLoadingPrefetch: false,
      });
    }
  },

  refreshPrefetch: async () => {
    const { selectedBuilding } = get();
    if (!selectedBuilding) return;
    await get().loadPrefetch(selectedBuilding.id);
  },

  clearBuilding: async () => {
    await SecureStore.deleteItemAsync(SELECTED_BUILDING_KEY);
    set({ selectedBuilding: null, prefetchData: null });
  },

  restoreBuilding: async () => {
    const savedId = await SecureStore.getItemAsync(SELECTED_BUILDING_KEY);
    return savedId;
  },

  updateActiveAttendance: (attendance) => {
    const { prefetchData } = get();
    if (!prefetchData) return;
    set({ prefetchData: { ...prefetchData, activeAttendance: attendance } });
  },
}));
