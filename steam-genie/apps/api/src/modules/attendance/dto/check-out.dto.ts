import {
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsString,
  MaxLength,
  IsDateString,
} from 'class-validator';

export class CheckOutDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  gpsLat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  gpsLng!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;

  /** Device-side timestamp for offline support. If omitted, server time is used. */
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
