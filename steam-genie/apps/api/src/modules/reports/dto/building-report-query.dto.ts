import { IsUUID, IsOptional, IsISO8601 } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class BuildingReportQueryDto extends PaginationDto {
  @IsUUID()
  buildingId!: string;

  @IsISO8601()
  dateFrom!: string;

  @IsISO8601()
  dateTo!: string;

  @IsOptional()
  @IsUUID()
  floorId?: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;
}
