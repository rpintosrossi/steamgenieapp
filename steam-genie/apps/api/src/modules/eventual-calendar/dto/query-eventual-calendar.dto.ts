import {
  ArrayMinSize,
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

  /** Edificios a incluir (al menos uno). */
  @Transform(({ value, obj }) => {
    const ids = toStringArray(value);
    if (ids.length > 0) return ids;
    if (obj.buildingId) return [obj.buildingId];
    return [];
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  buildingIds!: string[];

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
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  includeReservations?: boolean = true;

  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  includeServices?: boolean = true;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 1000;
}
