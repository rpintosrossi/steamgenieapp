import { IsISO8601, IsOptional } from 'class-validator';

export class RescheduleWorkOrderDto {
  @IsISO8601()
  scheduledAt!: string;

  @IsOptional()
  @IsISO8601()
  deadlineAt?: string;
}
