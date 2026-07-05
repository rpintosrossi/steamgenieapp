import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class BulkAdjustItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  delta!: number;
}

export class BulkAdjustStockDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkAdjustItemDto)
  adjustments!: BulkAdjustItemDto[];
}
