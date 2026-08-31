import { IsISO8601 } from 'class-validator';

export class RepeatWorkOrderDto {
  @IsISO8601()
  scheduledAt!: string;
}
