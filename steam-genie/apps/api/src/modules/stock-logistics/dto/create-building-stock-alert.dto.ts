import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { BUILDING_STOCK_ALERT_TYPES } from '@steam-genie/shared-constants';

export class CreateBuildingStockAlertDto {
  @IsUUID()
  productId!: string;

  @IsIn([...BUILDING_STOCK_ALERT_TYPES])
  alertType!: (typeof BUILDING_STOCK_ALERT_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
