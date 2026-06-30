import { IsIn, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const RECURRING_WORK_DISPLAY_STATUSES = ['COMPLETED', 'SCHEDULED', 'OVERDUE'] as const;
export type RecurringWorkDisplayStatus = (typeof RECURRING_WORK_DISPLAY_STATUSES)[number];

export class QueryRecurringWorkDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @IsIn(RECURRING_WORK_DISPLAY_STATUSES)
  status?: RecurringWorkDisplayStatus;

  @IsOptional()
  @IsString()
  search?: string;

  /** Fecha de referencia para el período (YYYY-MM-DD). Por defecto: hoy. */
  @IsOptional()
  @IsDateString()
  periodDate?: string;
}
