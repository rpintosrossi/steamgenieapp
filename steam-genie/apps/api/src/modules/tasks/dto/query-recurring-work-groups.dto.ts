import { IsIn, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const RECURRING_WORK_GROUP_STATUSES = [
  'COMPLETED',
  'SCHEDULED',
  'OVERDUE',
  'PARTIAL',
] as const;

export type RecurringWorkGroupStatusFilter =
  (typeof RECURRING_WORK_GROUP_STATUSES)[number];

export class QueryRecurringWorkGroupsDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @IsIn(RECURRING_WORK_GROUP_STATUSES)
  groupStatus?: RecurringWorkGroupStatusFilter;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  periodDate?: string;
}
