import { IsUUID, IsISO8601 } from 'class-validator';

export class WorkerReportQueryDto {
  @IsUUID()
  userId!: string;

  @IsISO8601()
  dateFrom!: string;

  @IsISO8601()
  dateTo!: string;
}
