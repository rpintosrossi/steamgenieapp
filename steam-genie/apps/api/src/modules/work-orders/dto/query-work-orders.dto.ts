import { IsOptional, IsUUID, IsEnum, IsDateString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { WorkOrderStatus, WorkOrderType } from '@prisma/client';

export class QueryWorkOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @IsOptional()
  @IsEnum(WorkOrderType)
  type?: WorkOrderType;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  /** Orden por fecha programada y hora (asc | desc). */
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
