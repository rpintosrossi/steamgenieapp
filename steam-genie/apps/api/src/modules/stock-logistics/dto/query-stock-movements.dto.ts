import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class QueryStockMovementsDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
