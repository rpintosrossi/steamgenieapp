import {
  IsUUID,
  IsDateString,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsOptional,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class QueryEventualCalendarDto {
  /** Primer día del rango (YYYY-MM-DD, inclusive). */
  @IsDateString()
  from!: string;

  /** Último día del rango (YYYY-MM-DD, inclusive). */
  @IsDateString()
  to!: string;

  /** Edificio obligatorio (escala multi-edificio). */
  @IsUUID()
  buildingId!: string;

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
