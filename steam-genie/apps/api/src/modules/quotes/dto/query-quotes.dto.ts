import { IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
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

  /** YYYY-MM: filtra por mes de requestDate */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
}
