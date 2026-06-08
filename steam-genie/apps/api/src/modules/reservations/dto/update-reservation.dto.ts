import { IsOptional, IsString, IsDateString, MaxLength } from 'class-validator';

export class UpdateReservationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  guestName?: string;

  @IsOptional()
  @IsDateString()
  checkinAt?: string;

  @IsOptional()
  @IsDateString()
  checkoutAt?: string;

  @IsOptional()
  @IsDateString()
  deadlineAt?: string;
}
