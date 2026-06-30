import { IsOptional, IsUUID, IsDateString } from 'class-validator';

export class QueryAttendanceTimelineDto {
  /** Check-in date (YYYY-MM-DD). Defaults to today (UTC). */
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;
}
