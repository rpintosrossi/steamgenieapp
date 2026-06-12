import {
  IsString,
  IsEnum,
  IsUUID,
  IsOptional,
  IsDateString,
  IsInt,
  IsObject,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SyncOperationType {
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
  START_WORK_ORDER = 'START_WORK_ORDER',
  MARK_WORK_ORDER_TASK = 'MARK_WORK_ORDER_TASK',
  MARK_PERIODIC_TASK = 'MARK_PERIODIC_TASK',
  COMPLETE_WORK_ORDER = 'COMPLETE_WORK_ORDER',
}

export class SyncOperationItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  clientOperationId!: string;

  @IsEnum(SyncOperationType)
  operationType!: SyncOperationType;

  /** Logical entity type (ATTENDANCE, WORK_ORDER, SERVICE_EXECUTION, TASK_EXECUTION). */
  @IsString()
  @MaxLength(50)
  entityType!: string;

  /** Server-side entity ID if known before the operation (e.g. workOrderId for START_WORK_ORDER). */
  @IsOptional()
  @IsUUID()
  entityId?: string | null;

  /** Device-side timestamp when the action was performed. */
  @IsDateString()
  occurredAt!: string;

  /**
   * Optimistic concurrency version the client based the action on.
   * If provided and the server-side version differs, the operation returns CONFLICT.
   * Leave undefined when the entity version is not tracked or unknown.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  baseVersion?: number;

  /** Operation-specific payload (validated per operationType inside SyncService). */
  @IsObject()
  payload!: Record<string, unknown>;
}

export class SyncBatchDto {
  /** Identifier of the device submitting the batch. */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  deviceId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationItemDto)
  operations!: SyncOperationItemDto[];
}
