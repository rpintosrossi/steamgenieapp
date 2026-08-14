import {
  ArrayUnique,
  IsArray,
  IsUUID,
  IsDateString,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsOptional,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }
  if (typeof value === 'string') {
    if (!value) return [];
    if (value.includes(',')) {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [value];
  }
  return [];
}

function toBooleanFlag(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return defaultValue;
}

export class QueryEventualCalendarDto {
  /** Primer día del rango (YYYY-MM-DD, inclusive). */
  @IsDateString()
  from!: string;

  /** Último día del rango (YYYY-MM-DD, inclusive). */
  @IsDateString()
  to!: string;

  /** Compatibilidad: un solo edificio vía buildingId. */
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  /** Edificios a incluir (UUID sueltos o separados por coma). */
  @Transform(({ value, obj }) => {
    const ids = toStringArray(value);
    if (ids.length > 0) return ids;
    if (obj.buildingId) return [obj.buildingId];
    return [];
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @IsOptional()
  buildingIds?: string[];

  @IsOptional()
  @IsUUID()
  floorId?: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsUUID()
  workerId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanFlag(value, true))
  @IsBoolean()
  includeReservations?: boolean = true;

  @IsOptional()
  @Transform(({ value }) => toBooleanFlag(value, true))
  @IsBoolean()
  includeServices?: boolean = true;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number = 2000;
}
