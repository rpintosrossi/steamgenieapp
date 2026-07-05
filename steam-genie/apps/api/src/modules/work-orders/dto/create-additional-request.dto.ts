import {
  IsString,
  IsUUID,
  IsOptional,
  IsISO8601,
  MaxLength,
} from 'class-validator';

export class CreateAdditionalRequestDto {
  @IsUUID()
  buildingId!: string;

  @IsUUID()
  floorId!: string;

  @IsUUID()
  zoneId!: string;

  @IsOptional()
  @IsUUID()
  subzoneId?: string;

  @IsISO8601()
  scheduledAt!: string;

  @IsOptional()
  @IsISO8601()
  deadlineAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsString()
  @MaxLength(2000)
  description!: string;
}
