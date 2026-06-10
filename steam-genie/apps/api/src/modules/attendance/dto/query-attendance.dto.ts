import { IsOptional, IsUUID, IsDateString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryAttendanceDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;

  /** Filter by check-in date (YYYY-MM-DD). Returns attendances that started on that day. */
  @IsOptional()
  @IsDateString()
  date?: string;
}
