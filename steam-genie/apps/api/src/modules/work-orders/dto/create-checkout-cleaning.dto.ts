import {
  IsString,
  IsUUID,
  IsOptional,
  IsISO8601,
  MaxLength,
} from 'class-validator';

export class CreateCheckoutCleaningDto {
  @IsUUID()
  buildingId!: string;

  @IsUUID()
  floorId!: string;

  @IsUUID()
  zoneId!: string;

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
