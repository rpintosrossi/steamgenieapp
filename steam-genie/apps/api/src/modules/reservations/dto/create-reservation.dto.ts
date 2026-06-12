import {
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { ReservationSource } from '@prisma/client';

export class CreateReservationDto {
  @IsUUID()
  buildingId!: string;

  @IsUUID()
  floorId!: string;

  @IsUUID()
  zoneId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  guestName?: string;

  @IsDateString()
  checkinAt!: string;

  @IsDateString()
  checkoutAt!: string;

  @IsOptional()
  @IsDateString()
  deadlineAt?: string;

  @IsOptional()
  @IsEnum(ReservationSource)
  source?: ReservationSource;
}
