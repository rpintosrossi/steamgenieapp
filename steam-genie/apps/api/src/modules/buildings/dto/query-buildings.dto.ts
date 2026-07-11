import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryBuildingsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  /** Si es true, incluye inactivos. Por defecto solo activos. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  includeInactive?: boolean;
}
