import {
  IsString,
  MinLength,
  MaxLength,
  IsUUID,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
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

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name!: string;

  @IsEnum(TaskFrequency)
  frequency!: TaskFrequency;

  @IsOptional()
  @IsDateString()
  startDate?: string;

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
