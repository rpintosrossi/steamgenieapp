import { IsOptional, IsUUID } from 'class-validator';

export class QueryDashboardStatsDto {
  @IsOptional()
  @IsUUID()
  buildingId?: string;
}
