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
