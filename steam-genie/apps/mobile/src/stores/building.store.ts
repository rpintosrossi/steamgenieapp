import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { apiService } from '../services/api.service';
import {
  mapActiveAttendance,
  type ActiveAttendanceResponse,
} from '../utils/attendance';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Building {
  id: string;
  name: string;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  gpsRadiusM: number;
  requireGpsValidation?: boolean;
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

export interface WorkOrderLocationSnapshot {
  id: string;
  name: string;
}

export interface ReservationSnapshot {
  guestName?: string | null;
  checkinAt: string;
  checkoutAt: string;
  externalId?: string | null;
  status?: string;
  floor?: WorkOrderLocationSnapshot | null;
  zone?: WorkOrderLocationSnapshot | null;
  subzone?: WorkOrderLocationSnapshot | null;
}

export interface WorkOrderCached {
  id: string;
  status: string;
  type: string;
  title: string;
  description?: string | null;
  scheduledDate: string | null;
  deadlineAt?: string | null;
  buildingId: string;
  floorId?: string | null;
  zoneId?: string | null;
  subzoneId?: string | null;
  version?: number;
  floor?: WorkOrderLocationSnapshot | null;
  zone?: WorkOrderLocationSnapshot | null;
  subzone?: WorkOrderLocationSnapshot | null;
  reservation?: ReservationSnapshot | null;
  workOrderTasks?: WorkOrderTaskSnapshot[];
  assignments?: { userId: string; status: string }[];
  _count?: { workOrderTasks: number; assignments: number };
}

export interface AttendanceCached {
  id: string;
  buildingId: string;
  checkInAt: string;
  checkInGpsLat: string | null;
  checkInGpsLng: string | null;
  version: number;
}

export interface PeriodicTaskCached {
  id: string;
  name: string;
  frequency: string;
  zoneId: string | null;
  subzoneId: string | null;
  startDate: string;
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
  periodicTasks: PeriodicTaskCached[];
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
  syncActiveAttendance: () => Promise<AttendanceCached | null>;
  patchWorkOrder: (id: string, patch: Partial<WorkOrderCached>) => void;
  removeWorkOrderFromPrefetch: (id: string) => void;
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
      set({
        prefetchData: {
          ...data,
          floors: Array.isArray(data.floors) ? data.floors : [],
          zones: Array.isArray(data.zones) ? data.zones : [],
          subzones: Array.isArray(data.subzones) ? data.subzones : [],
          periodicTasks: Array.isArray(data.periodicTasks) ? data.periodicTasks : [],
          workOrders: Array.isArray(data.workOrders) ? data.workOrders : [],
        },
        selectedBuilding: data.building,
        isLoadingPrefetch: false,
      });
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
    const { prefetchData, selectedBuilding } = get();
    if (prefetchData) {
      set({ prefetchData: { ...prefetchData, activeAttendance: attendance } });
      return;
    }
    if (!selectedBuilding) return;
    set({
      prefetchData: {
        serverTime: new Date().toISOString(),
        building: selectedBuilding,
        floors: [],
        zones: [],
        subzones: [],
        workOrders: [],
        serviceExecutions: [],
        activeAttendance: attendance,
        rejectionReasons: [],
        periodicTasks: [],
      },
    });
  },

  syncActiveAttendance: async () => {
    try {
      const active = await apiService.get<ActiveAttendanceResponse | null>(
        '/attendance/active',
      );
      const mapped = active ? mapActiveAttendance(active) : null;
      get().updateActiveAttendance(mapped);
      return mapped;
    } catch {
      return get().prefetchData?.activeAttendance ?? null;
    }
  },

  patchWorkOrder: (id, patch) => {
    const { prefetchData } = get();
    if (!prefetchData) return;
    set({
      prefetchData: {
        ...prefetchData,
        workOrders: prefetchData.workOrders.map((wo) =>
          wo.id === id ? { ...wo, ...patch } : wo,
        ),
      },
    });
  },

  removeWorkOrderFromPrefetch: (id) => {
    const { prefetchData } = get();
    if (!prefetchData) return;
    set({
      prefetchData: {
        ...prefetchData,
        workOrders: prefetchData.workOrders.filter((wo) => wo.id !== id),
      },
    });
  },
}));
