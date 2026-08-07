import {
  IsString,
  MinLength,
  MaxLength,
  IsUUID,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsArray,
  IsInt,
  Min,
  Max,
  ArrayUnique,
} from 'class-validator';
import { TaskFrequency } from '@prisma/client';

export class CreateTaskDto {
  @IsUUID()
  buildingId!: string;

  @IsUUID()
  zoneId!: string;

  @IsOptional()
  @IsUUID()
  subzoneId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name!: string;

  @IsEnum(TaskFrequency)
  frequency!: TaskFrequency;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** Days of week for CUSTOM_WEEKDAYS (0=Sun … 6=Sat). Ignored for other frequencies. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @IsOptional()
  @IsBoolean()
  allowsPhoto?: boolean;

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
