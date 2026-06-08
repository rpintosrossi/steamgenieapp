export interface WorkOrderSummary {
  id: string;
  type: string;
  title: string;
  status: string;
  scheduledDate: string | null;
  buildingId: string;
  zoneId: string | null;
  subzoneId: string | null;
}

export interface WorkOrderTaskSnapshot {
  id: string;
  workOrderId: string;
  taskId: string;
  nameSnapshot: string;
  requiresPhotoSnapshot: boolean;
  allowsObservationSnapshot: boolean;
  requiresRejectionReasonSnapshot: boolean;
  sortOrder: number;
}
