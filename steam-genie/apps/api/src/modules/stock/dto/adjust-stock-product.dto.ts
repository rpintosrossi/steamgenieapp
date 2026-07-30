import { IsNumber, IsUUID } from 'class-validator';

export class AdjustStockProductDto {
  @IsUUID()
  warehouseId!: string;

  @IsNumber()
  delta!: number;
}
