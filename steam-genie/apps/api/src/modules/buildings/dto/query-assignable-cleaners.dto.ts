import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class QueryAssignableCleanersDto {
  /** YYYY-MM-DD — fecha del servicio a asignar (para recomendaciones). */
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  /** Excluir este servicio al buscar otros del mismo día. */
  @IsOptional()
  @IsUUID()
  excludeWorkOrderId?: string;
}
