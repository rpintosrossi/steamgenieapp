import {
  IsString,
  IsUUID,
  IsOptional,
  IsISO8601,
  MaxLength,
  IsArray,
  ArrayUnique,
} from 'class-validator';

export class CreateCheckoutCleaningDto {
  @IsUUID()
  buildingId!: string;

  @IsUUID()
  floorId!: string;

  @IsUUID()
  zoneId!: string;

  /**
   * Filtro opcional de categorías.
   * - Vacío / omitido → todas las tareas eventuales de la zona.
   * - UUIDs → tareas de esas categorías.
   * - `__uncategorized__` → tareas sin categoría.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsISO8601()
  scheduledAt!: string;

  @IsOptional()
  @IsISO8601()
  deadlineAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
