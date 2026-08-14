import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { QuoteStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryQuotesDto extends PaginationDto {
  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;

  @IsOptional()
  @IsUUID()
  particularClientId?: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;

  /** YYYY-MM: filtra por mes de requestDate (opcional) */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Busca por número de presupuesto o nombre de cliente (particular / edificio / eventual) */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
