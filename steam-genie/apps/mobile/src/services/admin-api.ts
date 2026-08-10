import { apiService } from './api.service';

// ─── Shared ───────────────────────────────────────────────────────────────────

export interface AdminBuilding {
  id: string;
  name: string;
}

export interface AdminUserItem {
  id: string;
  dni: string;
  fullName: string;
  primaryRole: string;
  isActive: boolean;
}

interface Paginated<T> {
  data: T[];
  total?: number;
  page?: number;
  limit?: number;
  pages?: number;
}

function normalizeList<T>(response: unknown): T[] {
  if (!response || typeof response !== 'object') return [];
  if (Array.isArray(response)) return response as T[];
  const payload = response as Paginated<T>;
  return Array.isArray(payload.data) ? payload.data : [];
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export interface EventualCalendarAssignment {
  id: string;
  userId: string;
  status: string;
  user?: { id: string; fullName: string; dni: string };
}

export interface EventualCalendarService {
  id: string;
  title: string;
  status: string;
  buildingId: string;
  floorId: string | null;
  zoneId: string | null;
  subzoneId: string | null;
  reservationId: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  deadlineAt: string | null;
  unassigned: boolean;
  building?: { id: string; name: string };
  floor?: { id: string; name: string } | null;
  zone?: { id: string; name: string } | null;
  subzone?: { id: string; name: string } | null;
  activeAssignments: EventualCalendarAssignment[];
}

export interface EventualCalendarReservation {
  id: string;
  buildingId: string;
  guestName?: string | null;
  checkinAt: string;
  checkoutAt: string;
  building?: { id: string; name: string };
  floor?: { id: string; name: string };
  zone?: { id: string; name: string };
  subzone?: { id: string; name: string } | null;
}

export interface EventualCalendarResponse {
  reservations: EventualCalendarReservation[];
  services: EventualCalendarService[];
  from: string;
  to: string;
  totals: { reservations: number; services: number };
  truncated: { reservations: boolean; services: boolean };
}

export interface QueryEventualCalendarBody {
  from: string;
  to: string;
  buildingIds: string[];
  includeReservations?: boolean;
  includeServices?: boolean;
  workerId?: string;
}

// ─── Stock ────────────────────────────────────────────────────────────────────

export interface BuildingStockAlertRow {
  id: string;
  buildingId: string;
  productId: string;
  alertType: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'OBSERVATION';
  status: 'OPEN' | 'IN_TRANSIT' | 'RESOLVED';
  deliveryDate?: string | null;
  note?: string | null;
  photoStorageKey?: string | null;
  photoUrl?: string | null;
  createdAt: string;
  building: { id: string; name: string };
  product: { id: string; name: string; unitType: string; sku: string | null };
  reportedBy: { id: string; fullName: string };
  shipmentDestination?: {
    id: string;
    deliveryDate: string | null;
    order: { id: string; reference: string; status: string };
  } | null;
}

export interface ShipmentLineItem {
  id: string;
  productId: string;
  quantity: number;
  status: string;
  product: { id: string; name: string; unitType: string; sku: string | null };
}

export interface ShipmentDestinationItem {
  id: string;
  buildingId: string;
  deliveryDate: string | null;
  status: 'PENDING' | 'DELIVERED' | 'CANCELLED';
  deliveredAt: string | null;
  confirmedById: string | null;
  building: { id: string; name: string };
  lines: ShipmentLineItem[];
}

export interface ShipmentOrderItem {
  id: string;
  reference: string;
  status: 'DRAFT' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  notes: string | null;
  sourceWarehouseId: string;
  sourceWarehouse?: { id: string; name: string; type: string };
  createdAt: string;
  destinations: ShipmentDestinationItem[];
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface AttendanceTimelineItem {
  id: string;
  checkInAt: string;
  checkOutAt: string | null;
  checkInGpsLat?: number | null;
  checkInGpsLng?: number | null;
  checkInOutOfRange?: boolean;
  checkInDistanceM?: number | null;
  checkOutGpsLat?: number | null;
  checkOutGpsLng?: number | null;
  checkOutOutOfRange?: boolean;
  checkOutDistanceM?: number | null;
  user: { id: string; fullName: string; dni: string };
  building: {
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    gpsRadiusM?: number;
  };
  taskProgress: { total: number; completed: number } | undefined;
}

export interface AttendanceTimelineResponse {
  data: AttendanceTimelineItem[];
  total: number;
  truncated: boolean;
}

export interface TimelineTaskRow {
  id: string;
  taskId: string;
  name: string;
  isActive: boolean;
  displayStatus: string;
  instanceStatus: string;
  zone?: { id: string; name: string; floor?: { id: string; name: string } | null } | null;
  subzone?: { id: string; name: string } | null;
  execution?: {
    id: string;
    status: string;
    executedBy?: { id: string; fullName: string; dni: string } | null;
    executedAt?: string | null;
    observation?: string | null;
    photos?: Array<{ id: string; url: string }>;
  } | null;
}

// ─── Work order detail ────────────────────────────────────────────────────────

export interface AdminWorkOrderQuote {
  id: string;
  number: number;
  particularClient?: { name: string } | null;
  eventualClient?: { name: string } | null;
  building?: { name: string } | null;
}

export interface AdminWorkOrderDetail {
  id: string;
  title: string;
  type: string;
  status: string;
  description: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  quoteId?: string | null;
  quote?: AdminWorkOrderQuote | null;
  building: { id: string; name: string; buildingMode?: string; photoEvidenceMode?: string };
  floor: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
  subzone: { id: string; name: string } | null;
  assignments: EventualCalendarAssignment[];
  serviceExecutions?: Array<{
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    participants: Array<{
      id: string;
      userId: string;
      user?: { id: string; fullName: string };
    }>;
  }>;
}

export interface ServiceExecutionTaskPhoto {
  id: string;
  url: string;
  originalFilename: string | null;
  capturedAt: string | null;
  uploadedAt: string;
}

export interface ServiceExecutionPhasePhoto extends ServiceExecutionTaskPhoto {
  phase: 'BEFORE' | 'DURING' | 'AFTER';
  uploadedByName?: string | null;
}

export interface ServiceExecutionTaskItem {
  workOrderTaskId: string;
  nameSnapshot: string;
  sortOrder: number;
  execution: {
    id: string;
    status: string;
    executedByName: string;
    executedAt: string;
    observation: string | null;
    photos: ServiceExecutionTaskPhoto[];
  } | null;
}

// ─── API wrappers ─────────────────────────────────────────────────────────────

export const adminApi = {
  listBuildings: async (): Promise<AdminBuilding[]> => {
    const all: AdminBuilding[] = [];
    let page = 1;
    let pages = 1;

    while (page <= pages) {
      // Igual que la web admin: incluir sitios de clientes particulares.
      const res = await apiService.get<unknown>(
        `/buildings?limit=100&page=${page}&includeParticularSites=true`,
      );
      const batch = normalizeList<AdminBuilding>(res).map((b) => ({
        id: b.id,
        name: b.name,
      }));
      all.push(...batch);

      if (res && typeof res === 'object' && !Array.isArray(res)) {
        const paginated = res as Paginated<AdminBuilding>;
        pages = typeof paginated.pages === 'number' && paginated.pages > 0 ? paginated.pages : 1;
      } else {
        break;
      }

      if (batch.length === 0) break;
      page += 1;
    }

    return all.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  },

  searchUsers: async (search: string): Promise<AdminUserItem[]> => {
    const q = search.trim();
    if (!q) return [];
    const params = new URLSearchParams({ search: q, limit: '20' });
    const res = await apiService.get<unknown>(`/users?${params.toString()}`);
    return normalizeList<AdminUserItem>(res);
  },

  queryCalendar: (body: QueryEventualCalendarBody) =>
    apiService.post<EventualCalendarResponse>('/eventual-calendar/query', body),

  listAlerts: async (buildingId?: string) => {
    const qs = buildingId ? `?buildingId=${encodeURIComponent(buildingId)}` : '';
    const res = await apiService.get<unknown>(`/stock-logistics/alerts${qs}`);
    return Array.isArray(res) ? (res as BuildingStockAlertRow[]) : [];
  },

  resolveAlert: (alertId: string) =>
    apiService.post<BuildingStockAlertRow>(`/stock-logistics/alerts/${alertId}/resolve`, {}),

  listShipments: async () => {
    const res = await apiService.get<unknown>('/stock-logistics/shipments');
    return Array.isArray(res) ? (res as ShipmentOrderItem[]) : [];
  },

  deliverDestination: (destinationId: string) =>
    apiService.postOk(`/stock-logistics/shipments/destinations/${destinationId}/deliver`, {}),

  getTimeline: (params: { date?: string; buildingId?: string; userId?: string }) => {
    const qs = new URLSearchParams();
    if (params.date) qs.set('date', params.date);
    if (params.buildingId) qs.set('buildingId', params.buildingId);
    if (params.userId) qs.set('userId', params.userId);
    const query = qs.toString();
    return apiService.get<AttendanceTimelineResponse>(
      `/attendance/timeline${query ? `?${query}` : ''}`,
    );
  },

  getTimelineTasks: (buildingId: string, date: string) => {
    const qs = new URLSearchParams({ buildingId, date });
    return apiService.get<TimelineTaskRow[]>(`/attendance/timeline/tasks?${qs.toString()}`);
  },

  getWorkOrder: (id: string) => apiService.get<AdminWorkOrderDetail>(`/work-orders/${id}`),

  getExecutionTasks: (serviceExecutionId: string) =>
    apiService.get<ServiceExecutionTaskItem[]>(`/service-executions/${serviceExecutionId}/tasks`),

  getPhasePhotos: (serviceExecutionId: string) =>
    apiService.get<ServiceExecutionPhasePhoto[]>(
      `/service-executions/${serviceExecutionId}/phase-photos`,
    ),
};
