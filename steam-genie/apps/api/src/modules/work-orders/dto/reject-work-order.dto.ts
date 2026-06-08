import { IsOptional, IsUUID, IsString, MaxLength } from 'class-validator';

export class RejectWorkOrderDto {
  @IsOptional()
  @IsUUID()
  rejectionReasonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionNote?: string;
}
