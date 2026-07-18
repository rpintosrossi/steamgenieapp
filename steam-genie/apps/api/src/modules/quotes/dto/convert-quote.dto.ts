import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ConvertQuoteDto {
  @IsISO8601()
  scheduledAt!: string;

  @IsOptional()
  @IsUUID()
  floorId?: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsUUID()
  subzoneId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
