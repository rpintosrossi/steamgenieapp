import {
  IsOptional,
  IsDateString,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CorrectAttendanceDto {
  @IsOptional()
  @IsDateString()
  checkInAt?: string;

  @IsOptional()
  @IsDateString()
  checkOutAt?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  correctionNote!: string;
}
