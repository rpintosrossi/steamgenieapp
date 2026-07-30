import { StockWarehouseType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateStockWarehouseDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsEnum(StockWarehouseType)
  type?: StockWarehouseType;

  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
