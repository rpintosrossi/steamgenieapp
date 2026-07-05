import { IsNumber, IsUUID, Min } from 'class-validator';

export class UpsertBuildingStockDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;
}
