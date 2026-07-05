import { IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryRecurringWorkGroupTasksDto extends PaginationDto {
  @IsUUID()
  buildingId!: string;

  @IsUUID()
  floorId!: string;

  @IsUUID()
  zoneId!: string;

  @IsOptional()
  @IsUUID()
  subzoneId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  periodDate?: string;
}
