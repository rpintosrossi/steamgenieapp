import {
  IsOptional,
  IsDateString,
  IsNumber,
  Min,
  Max,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Body fields for multipart/form-data photo upload.
 * The file itself is received via the `photo` field (handled by FileInterceptor).
 * Numeric fields are sent as strings in multipart; @Type(() => Number) coerces them.
 */
export class UploadPhotoDto {
  /** ISO 8601 timestamp when the photo was captured on the device. */
  @IsOptional()
  @IsDateString()
  capturedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  gpsLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  gpsLng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;

  /** Idempotency key for offline sync (prevents duplicate uploads). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientOperationId?: string;
}
