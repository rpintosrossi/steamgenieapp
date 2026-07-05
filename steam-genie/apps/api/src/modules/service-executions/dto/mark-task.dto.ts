import { IsEnum, IsOptional, IsUUID, IsString, MaxLength, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskExecutionStatus } from '@prisma/client';
import { TaskFieldValueDto } from './task-field-value.dto';

export class MarkTaskDto {
  @IsEnum(TaskExecutionStatus)
  status!: TaskExecutionStatus;

  /** Required when status = NOT_DONE and the task snapshot has requiresRejectionReasonSnapshot = true. */
  @IsOptional()
  @IsUUID()
  rejectionReasonId?: string;

  /** Free-text observation. Only allowed when task snapshot has allowsObservationSnapshot = true. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;

  /** Dropdown custom field selections (fieldId + selected option IDs). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskFieldValueDto)
  fieldValues?: TaskFieldValueDto[];

  /** Idempotency key for offline sync (prevents duplicate marks). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientOperationId?: string;
}
