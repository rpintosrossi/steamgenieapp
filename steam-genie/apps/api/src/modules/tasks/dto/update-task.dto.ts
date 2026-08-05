import {
  IsString,
  MinLength,
  MaxLength,
  IsUUID,
  IsOptional,
  IsBoolean,
  IsISO8601,
  ValidateIf,
  IsArray,
  IsInt,
  Min,
  Max,
  ArrayUnique,
} from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  subzoneId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  categoryId?: string | null;

  /** Days of week for CUSTOM_WEEKDAYS (0=Sun … 6=Sat). Only valid for that frequency. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @IsOptional()
  @IsBoolean()
  requiresPhoto?: boolean;

  @IsOptional()
  @IsBoolean()
  allowsObservation?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresRejectionReason?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
