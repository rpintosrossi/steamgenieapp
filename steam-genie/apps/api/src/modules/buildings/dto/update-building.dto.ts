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
import { BuildingMode, PhotoEvidenceMode } from '@prisma/client';

export class UpdateBuildingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

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

  @IsOptional()
  @IsBoolean()
  requireGpsValidation?: boolean;

  @IsOptional()
  @IsEnum(BuildingMode)
  buildingMode?: BuildingMode;

  /** Only meaningful when buildingMode = SIMPLE. */
  @IsOptional()
  @IsEnum(PhotoEvidenceMode)
  photoEvidenceMode?: PhotoEvidenceMode;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
