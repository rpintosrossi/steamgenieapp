import { IsNumber } from 'class-validator';

export class AdjustStockProductDto {
  @IsNumber()
  delta!: number;
}
