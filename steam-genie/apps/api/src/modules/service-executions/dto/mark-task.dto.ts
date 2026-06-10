import { IsEnum, IsOptional, IsUUID, IsString, MaxLength } from 'class-validator';
import { TaskExecutionStatus } from '@prisma/client';

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
}
