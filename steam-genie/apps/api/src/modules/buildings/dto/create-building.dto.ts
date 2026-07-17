import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PhotoEvidenceMode } from '@prisma/client';

export class CreateBuildingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  gpsRadiusM?: number;

  /** If true, attendance check-in/out validates the user is within gpsRadiusM. */
  @IsOptional()
  @IsBoolean()
  requireGpsValidation?: boolean;

  /** PER_TASK (default) or BEFORE_DURING_AFTER phase evidence. */
  @IsOptional()
  @IsEnum(PhotoEvidenceMode)
  photoEvidenceMode?: PhotoEvidenceMode;
}
