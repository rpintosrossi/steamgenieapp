export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export type BuildingMode = 'SIMPLE' | 'DETAILED';
export type PhotoEvidenceMode = 'PER_TASK' | 'BEFORE_DURING_AFTER';
export type PhotoPhase = 'BEFORE' | 'DURING' | 'AFTER';

export interface Building {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  gpsRadiusM?: number;
  /** If true, attendance validates the user is within the building GPS radius. */
  requireGpsValidation?: boolean;
  /** SIMPLE = simpler workflows; DETAILED = richer per-task flows. */
  buildingMode?: BuildingMode;
  /** Only meaningful when buildingMode = SIMPLE. PER_TASK or BEFORE_DURING_AFTER. */
  photoEvidenceMode?: PhotoEvidenceMode;
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

export interface AssignableCleanerSameDayService {
  workOrderId: string;
  title: string;
  zoneName: string | null;
  scheduledTime: string | null;
}

export interface AssignableCleanerPriorRejection {
  reason: string | null;
  rejectedAt: string | null;
}

export interface AssignableCleanerItem {
  id: string;
  fullName: string;
  dni: string;
  /** cleaner | manager — rol operativo con el que aparece en la lista. */
  assignableRole?: 'cleaner' | 'manager';
  recommended: boolean;
  sameDayServices: AssignableCleanerSameDayService[];
  priorRejection: AssignableCleanerPriorRejection | null;
}

export interface AssignableCleanersResponse {
  cleaners: AssignableCleanerItem[];
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
  categoryId?: string | null;
  name: string;
  frequency: string;
  startDate: string;
  requiresPhoto: boolean;
  allowsObservation: boolean;
  requiresRejectionReason: boolean;
  isActive: boolean;
  category?: { id: string; name: string } | null;
  building?: { id: string; name: string };
  floor?: { id: string; name: string } | null;
  zone?: { id: string; name: string; floor?: { id: string; name: string } | null } | null;
  subzone?: { id: string; name: string } | null;
}

export interface TaskCategoryItem {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number };
}

export interface RecurringWorkGroupSummary {
  key: string;
  buildingId: string;
  floorId: string | null;
  zoneId: string | null;
  subzoneId: string | null;
  building: RecurringWorkListItem['building'];
  floor: RecurringWorkListItem['floor'];
  zone: RecurringWorkListItem['zone'];
  subzone: RecurringWorkListItem['subzone'];
  periodLabelDisplay: string;
  aggregateStatus: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE' | 'PARTIAL';
  taskCount: number;
}

export interface RecurringWorkListItem {
  id: string;
  taskId: string;
  taskName: string;
  frequency: string;
  requiresPhoto: boolean;
  photoEvidenceMode?: PhotoEvidenceMode;
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
  phasePhotos?: Array<{
    id: string;
    phase: PhotoPhase;
    url: string;
    originalFilename: string | null;
    capturedAt: string | null;
    uploadedAt: string;
    uploadedBy: { id: string; fullName: string } | null;
  }>;
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
      capturedAt: string | null;
      uploadedAt: string;
      uploadedBy: { id: string; fullName: string } | null;
    }>;
  } | null;
}

export interface UserBuildingRoleItem {
  id: string;
  buildingId: string | null;
  building: { id: string; name: string } | null;
  role: { id: string; name: string };
}

export interface BuildingUserAssignment {
  id: string;
  userId: string;
  user: {
    id: string;
    dni: string;
    fullName: string;
    primaryRole: string;
    isActive: boolean;
  };
  role: { id: string; name: string };
  createdAt: string;
}

export interface BuildingGlobalAccessUser {
  id: string;
  userId: string;
  user: {
    id: string;
    dni: string;
    fullName: string;
    primaryRole: string;
    isActive: boolean;
  };
  role: { id: string; name: string };
}

export interface BuildingUserRolesResponse {
  assignments: BuildingUserAssignment[];
  globalAccess: BuildingGlobalAccessUser[];
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
  checkInOutOfRange?: boolean;
  checkInDistanceM?: number | null;
  checkOutOutOfRange?: boolean;
  checkOutDistanceM?: number | null;
  user: { id: string; fullName: string; dni: string };
  building: { id: string; name: string; gpsRadiusM?: number };
  taskProgress: { total: number; completed: number } | undefined;
}

export interface AttendanceTimelineResponse {
  data: AttendanceTimelineItem[];
  total: number;
  truncated: boolean;
}

export interface ReservationZoneReadiness {
  readyToOccupy: boolean;
  notReady: boolean;
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
  zoneReadiness?: ReservationZoneReadiness | null;
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
  reservationId?: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  deadlineAt: string | null;
  createdAt: string;
  building?: { id: string; name: string };
  zone?: { id: string; name: string } | null;
  assignments: WorkOrderAssignmentItem[];
  quote?: {
    id: string;
    number: number;
    items: Array<{ description: string; quantity: string | number }>;
  } | null;
  _count: { workOrderTasks: number; assignments: number };
}

export interface EventualCalendarReservation {
  id: string;
  buildingId: string;
  floorId: string;
  zoneId: string;
  subzoneId?: string | null;
  externalId?: string | null;
  guestName?: string | null;
  checkinAt: string;
  checkoutAt: string;
  durationMs: number;
  building?: { id: string; name: string };
  floor?: { id: string; name: string };
  zone?: { id: string; name: string };
  subzone?: { id: string; name: string } | null;
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
  activeAssignments: WorkOrderAssignmentItem[];
}

export interface EventualCalendarResponse {
  reservations: EventualCalendarReservation[];
  services: EventualCalendarService[];
  from: string;
  to: string;
  totals: {
    reservations: number;
    services: number;
  };
  truncated: {
    reservations: boolean;
    services: boolean;
  };
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

export interface ParticularClientItem {
  id: string;
  name: string;
  taxId?: string | null;
  address?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  isActive: boolean;
  buildingId: string;
  building: Building;
  createdAt: string;
  updatedAt: string;
}

export interface EventualClientItem {
  id: string;
  name: string;
  address?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type QuoteStatus =
  | 'COTIZADO'
  | 'EN_ESPERA'
  | 'ACEPTADO'
  | 'RECHAZADO'
  | 'TERMINADO';

export interface QuoteItem {
  id: string;
  quantity: string | number;
  description: string;
  unitPrice: string | number;
  discountPercent?: string | number | null;
  lineTotal: string | number;
  sortOrder: number;
}

export interface QuoteItemInput {
  quantity: number;
  description: string;
  unitPrice: number;
  discountPercent?: number;
}

export interface Quote {
  id: string;
  number: number;
  status: QuoteStatus;
  particularClientId?: string | null;
  buildingId?: string | null;
  eventualClientId?: string | null;
  requestDate: string;
  serviceType?: string | null;
  clientDetails?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  sellerName?: string | null;
  paymentCondition?: string | null;
  paymentTerms?: string | null;
  observations?: string | null;
  validUntil?: string | null;
  subtotal: string | number;
  discountPercent?: string | number | null;
  vatRate: string | number;
  vatAmount: string | number;
  total: string | number;
  workOrderId?: string | null;
  createdAt: string;
  updatedAt: string;
  items: QuoteItem[];
  particularClient?: Pick<
    ParticularClientItem,
    'id' | 'name' | 'taxId' | 'address' | 'contactName' | 'email' | 'phone' | 'buildingId'
  > | null;
  building?: Pick<Building, 'id' | 'name' | 'address' | 'city' | 'province'> | null;
  eventualClient?: Pick<EventualClientItem, 'id' | 'name' | 'address'> | null;
  workOrder?: {
    id: string;
    title: string;
    status: string;
    scheduledDate?: string | null;
  } | null;
  createdBy?: { id: string; fullName: string };
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

export interface DashboardOperationalTimes {
  avgServiceDurationMinutes: number | null;
  totalAttendanceHoursToday: number;
}

export interface DashboardStats {
  pendingServices: number;
  inProgressServices: number;
  completedServicesToday: number;
  upcomingReservations: number;
  roomsNotReady: number;
  overdueTasks: number;
  activePresence: number;
  operationalTimes: DashboardOperationalTimes;
  generatedAt: string;
}

export interface WorkOrderExpenseItem {
  id: string;
  workOrderId: string;
  concept: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderFinance {
  id: string;
  title: string;
  status: string;
  scheduledDate: string | null;
  clientAmountCharged: number | null;
  building: { id: string; name: string; city: string | null; province: string | null };
  expenses: WorkOrderExpenseItem[];
  expensesTotal: number;
}

export interface FixedExpenseItem {
  id: string;
  concept: string;
  amount: number;
  startDate: string;
  endDate: string | null;
  buildingId: string | null;
  isActive: boolean;
  building: { id: string; name: string } | null;
  scope: 'global' | 'building';
  createdAt: string;
  updatedAt: string;
}

export interface CommissionServiceCandidate {
  id: string;
  title: string;
  status: string;
  scheduledDate: string | null;
  clientAmountCharged: number | null;
  building: { id: string; name: string; city: string | null; province: string | null };
  cleaners: Array<{ id: string; fullName: string }>;
  expenses: Array<{ id: string; concept: string; amount: number }>;
  expensesTotal: number;
}

export interface CommissionSettlementListItem {
  id: string;
  beneficiaryName: string;
  beneficiaryUserId: string | null;
  beneficiaryUser: { id: string; fullName: string } | null;
  dateFrom: string;
  dateTo: string;
  percentage: number;
  commissionAmount: number;
  netAmount: number;
  currentPdfVersion: number;
  createdAt: string;
  createdBy: { id: string; fullName: string };
}

export interface CommissionSettlementDetail {
  id: string;
  beneficiaryUserId: string | null;
  beneficiaryName: string;
  beneficiaryUser: { id: string; fullName: string; dni?: string } | null;
  dateFrom: string;
  dateTo: string;
  percentage: number;
  totalClientCharged: number;
  totalServiceExpenses: number;
  totalFixedExpenses: number;
  netAmount: number;
  commissionAmount: number;
  calculationBreakdown: { lines?: string[] };
  currentPdfVersion: number;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    workOrderId: string;
    title: string;
    scheduledDate: string | null;
    buildingName: string;
    city: string | null;
    province: string | null;
    clientAmountCharged: number;
    serviceExpensesTotal: number;
    serviceExpenses: Array<{ concept: string; amount: number }>;
    cleaners: Array<{ id?: string; fullName: string }>;
  }>;
  fixedExpenses: Array<{
    id: string;
    fixedExpenseId: string | null;
    concept: string;
    buildingName: string | null;
    isGlobal: boolean;
    fullAmount: number;
    proratedAmount: number;
    daysInBasePeriod: number;
    daysOverlapping: number;
    included: boolean;
    prorationNote: string | null;
  }>;
  pdfVersions: Array<{
    id: string;
    version: number;
    note: string | null;
    createdAt: string;
    createdById: string | null;
  }>;
}

export interface ProratedFixedExpensePreview {
  fixedExpenseId: string;
  concept: string;
  buildingId: string | null;
  buildingName: string | null;
  isGlobal: boolean;
  fullAmount: number;
  proratedAmount: number;
  daysInBasePeriod: number;
  daysOverlapping: number;
  prorationNote: string;
  included: boolean;
}



