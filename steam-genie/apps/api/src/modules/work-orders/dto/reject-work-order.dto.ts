export class RejectWorkOrderDto {
  /** ID of a RejectionReason with type = SERVICE_REJECTION. Optional. */
  rejectionReasonId?: string;
  /** Free-text note to accompany the rejection. Optional. */
  rejectionNote?: string;
}
