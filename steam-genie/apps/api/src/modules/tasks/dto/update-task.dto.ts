import {
  IsString,
  MinLength,
  MaxLength,
  IsUUID,
  IsOptional,
  IsBoolean,
  IsISO8601,
  ValidateIf,
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
