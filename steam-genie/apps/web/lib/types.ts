export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Building {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  gpsRadiusM?: number;
  isActive?: boolean;
  createdAt?: string;
}

export interface Floor {
  id: string;
  buildingId: string;
  name: string;
  sortOrder: number;
}

export interface Zone {
  id: string;
  floorId: string;
  buildingId: string;
  name: string;
}

export interface Subzone {
  id: string;
  zoneId: string;
  buildingId: string;
  name: string;
}

export interface BuildingDetail extends Building {
  floors: Array<
    Floor & {
      zones: Array<
        Zone & {
          subzones: Subzone[];
        }
      >;
    }
  >;
}

/** Jerarquía mínima para selectores (LocationPicker). */
export interface BuildingHierarchy {
  id: string;
  name: string;
  floors: Array<
    Floor & {
      zones: Array<
        Zone & {
          subzones: Subzone[];
        }
      >;
    }
  >;
}

export interface AssignableCleanersResponse {
  cleaners: Array<{ id: string; fullName: string; dni: string }>;
  otherUsersOnBuilding: Array<{
    id: string;
    fullName: string;
    dni: string;
    primaryRole: string;
  }>;
}

export interface RejectionReasonItem {
  id: string;
  type: 'TASK_NOT_DONE' | 'SERVICE_REJECTION';
  text: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  id: string;
  buildingId: string;
  zoneId: string | null;
  subzoneId: string | null;
  name: string;
  frequency: string;
  startDate: string;
  requiresPhoto: boolean;
  allowsObservation: boolean;
  requiresRejectionReason: boolean;
  isActive: boolean;
  building?: { id: string; name: string };
  floor?: { id: string; name: string } | null;
  zone?: { id: string; name: string; floor?: { id: string; name: string } | null } | null;
  subzone?: { id: string; name: string } | null;
}

export interface RecurringWorkListItem {
  id: string;
  taskId: string;
  taskName: string;
  frequency: string;
  building: { id: string; name: string } | null;
  floor: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
  subzone: { id: string; name: string } | null;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  periodLabelDisplay: string;
  displayStatus: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE';
  instanceStatus: string;
  completedAt: string | null;
  execution: {
    id: string;
    status: string;
    observation: string | null;
    executedAt: string;
    executedBy: { id: string; fullName: string; dni: string };
    photos: Array<{
      id: string;
      url: string;
      originalFilename: string | null;
    }>;
  } | null;
}

export interface UserBuildingRoleItem {
  id: string;
  buildingId: string | null;
  building: { id: string; name: string } | null;
  role: { id: string; name: string };
}

export interface UserItem {
  id: string;
  dni: string;
  fullName: string;
  birthDate?: string | null;
  primaryRole: string;
  isActive: boolean;
  buildingRoles?: UserBuildingRoleItem[];
}

export interface UserDetail extends UserItem {
  buildingRoles: UserBuildingRoleItem[];
}

export interface RoleItem {
  id: string;
  name: string;
  description?: string | null;
  modules?: string[];
  isSystem?: boolean;
  userCount?: number;
}

export interface RoleDetailItem extends RoleItem {
  modules: string[];
  isSystem: boolean;
  userCount: number;
}

export interface AttendanceTimelineItem {
  id: string;
  checkInAt: string;
  checkOutAt: string | null;
  user: { id: string; fullName: string; dni: string };
  building: { id: string; name: string };
  taskProgress: { total: number; completed: number } | undefined;
}

export interface AttendanceTimelineResponse {
  data: AttendanceTimelineItem[];
  total: number;
  truncated: boolean;
}

export interface ReservationItem {
  id: string;
  buildingId: string;
  floorId: string;
  zoneId: string;
  subzoneId?: string | null;
  externalId?: string | null;
  guestName?: string | null;
  checkinAt: string;
  checkoutAt: string;
  status: string;
  source: string;
}

export interface CreateReservationResponse {
  reservation: ReservationItem;
  workOrder: { id: string; title: string; status: string; type: string };
  taskCount: number;
  warning?: string;
}

export interface CreateCheckoutCleaningResponse {
  workOrder: { id: string; title: string; status: string; type: string };
  taskCount: number;
  warning?: string;
}

export interface WorkOrderAssignmentItem {
  id: string;
  userId: string;
  status: string;
  user?: { id: string; fullName: string; dni: string };
}

export interface WorkOrderListItem {
  id: string;
  type: string;
  status: string;
  title: string;
  buildingId: string;
  zoneId: string | null;
  subzoneId: string | null;
  scheduledDate: string | null;
  deadlineAt: string | null;
  createdAt: string;
  building?: { id: string; name: string };
  zone?: { id: string; name: string } | null;
  assignments: WorkOrderAssignmentItem[];
  _count: { workOrderTasks: number; assignments: number };
}

export type BulkImportRowStatus = 'success' | 'error' | 'skipped';

export interface BulkImportRowInterpretation {
  building: string;
  buildingId: string;
  floor: string;
  floorCreated: boolean;
  zone: string;
  zoneCreated: boolean;
  subzone?: string;
  subzoneCreated?: boolean;
  task?: string;
  taskCreated?: boolean;
  taskUpdated?: boolean;
  taskSkipped?: boolean;
  frequency?: string;
  startDate?: string;
}

export interface BulkImportRowResult {
  row: number;
  status: BulkImportRowStatus;
  message: string;
  interpretation?: BulkImportRowInterpretation;
}

export interface BulkImportSummary {
  buildingsTouched: string[];
  floorsCreated: number;
  zonesCreated: number;
  subzonesCreated: number;
  tasksCreated: number;
  tasksUpdated: number;
  tasksSkipped: number;
}

export interface BulkImportResult {
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  rows: BulkImportRowResult[];
  summary: BulkImportSummary;
}

export interface StockCategoryItem {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
}

export interface StockSupplierItem {
  id: string;
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
}

export interface StockProductItem {
  id: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  categoryId: string;
  supplierId?: string | null;
  quantity: number;
  reservedQuantity?: number;
  /** Stock disponible en depósito (quantity − reservado). */
  available?: number;
  availableQuantity?: number;
  minQuantity: number;
  unitType: string;
  isActive: boolean;
  status: 'OK' | 'LOW' | 'OUT';
  stockUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
  category: StockCategoryItem;
  supplier?: StockSupplierItem | null;
}

export interface StockProductGroup {
  category: { id: string; name: string; sortOrder: number };
  products: StockProductItem[];
}

export interface StockStats {
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
}

export interface BuildingStockAlertSummary {
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
}

export interface BuildingStockAlertRow extends BuildingStockAlertSummary {
  building: { id: string; name: string };
  product: { id: string; name: string; unitType: string; sku: string | null };
  reportedBy: { id: string; fullName: string };
  shipmentDestination?: {
    id: string;
    deliveryDate: string | null;
    order: { id: string; reference: string; status: string };
  } | null;
}

export interface StockMonitoringCell {
  buildingId: string;
  productId: string;
  quantity: number;
  alert: BuildingStockAlertSummary | null;
}

export interface StockMonitoringMatrix {
  depotStats: StockStats;
  buildingAlertStats: { open: number; inTransit: number };
  buildings: Array<{ id: string; name: string }>;
  products: Array<{
    id: string;
    name: string;
    sku: string | null;
    unitType: string;
    category: { id: string; name: string; sortOrder: number };
  }>;
  cells: StockMonitoringCell[];
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
  createdById: string;
  dispatchedById: string | null;
  dispatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
  destinations: ShipmentDestinationItem[];
}

export interface BuildingStockItemRow {
  id: string;
  buildingId: string;
  productId: string;
  quantity: number;
  product: { id: string; name: string; unitType: string; sku: string | null };
}

export interface StockMovementRow {
  id: string;
  scope: 'DEPOT' | 'BUILDING';
  movementType:
    | 'DEPOT_INITIAL'
    | 'DEPOT_ADJUST'
    | 'DEPOT_SET'
    | 'DEPOT_RESERVE'
    | 'DEPOT_RESERVE_RELEASE'
    | 'DEPOT_SHIP_OUT'
    | 'BUILDING_SET'
    | 'BUILDING_RECEIVE';
  productId: string;
  buildingId: string | null;
  building: { id: string; name: string } | null;
  quantityBefore: number;
  quantityDelta: number;
  quantityAfter: number;
  reservedBefore: number | null;
  reservedDelta: number | null;
  reservedAfter: number | null;
  note: string | null;
  occurredAt: string;
  performedBy: { id: string; fullName: string } | null;
  shipmentOrder: { id: string; reference: string } | null;
  shipmentDestination: {
    id: string;
    deliveredAt: string | null;
    confirmedBy: { id: string; fullName: string } | null;
  } | null;
}


