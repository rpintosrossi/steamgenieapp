import { IsUUID, IsOptional, IsISO8601 } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class DateReportQueryDto extends PaginationDto {
  @IsISO8601()
  dateFrom!: string;

  @IsISO8601()
  dateTo!: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
