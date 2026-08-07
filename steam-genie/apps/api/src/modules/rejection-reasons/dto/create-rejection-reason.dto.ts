import { IsBoolean, IsEnum, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { RejectionReasonType } from '@prisma/client';

export class CreateRejectionReasonDto {
  @IsEnum(RejectionReasonType)
  type!: RejectionReasonType;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  text!: string;

  /** Motivo con detalle libre (p. ej. "Otro"). */
  @IsOptional()
  @IsBoolean()
  allowsFreeText?: boolean;
}
