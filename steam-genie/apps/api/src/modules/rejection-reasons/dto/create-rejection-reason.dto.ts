import { IsEnum, IsString, MinLength, MaxLength } from 'class-validator';
import { RejectionReasonType } from '@prisma/client';

export class CreateRejectionReasonDto {
  @IsEnum(RejectionReasonType)
  type!: RejectionReasonType;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  text!: string;
}
