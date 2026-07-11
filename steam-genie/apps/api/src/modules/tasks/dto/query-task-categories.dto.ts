import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryTaskCategoriesDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeInactive?: boolean;

  /** Si se indica, solo categorías usadas por tareas EVENTUAL activas del edificio/zona. */
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  forEventualService?: boolean;
}
