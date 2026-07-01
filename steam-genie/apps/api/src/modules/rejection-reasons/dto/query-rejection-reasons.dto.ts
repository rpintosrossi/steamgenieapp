import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { RejectionReasonType } from '@prisma/client';

export class QueryRejectionReasonsDto {
  @IsOptional()
  @IsEnum(RejectionReasonType)
  type?: RejectionReasonType;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}
