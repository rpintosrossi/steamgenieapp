import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { BUILDING_STOCK_ALERT_TYPES } from '@steam-genie/shared-constants';

function parseProductIds(value: unknown): string[] | unknown {
  if (Array.isArray(value)) {
    return value.map(String).map((v) => v.trim()).filter(Boolean);
  }
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map((v) => v.trim()).filter(Boolean);
      }
    } catch {
      return value;
    }
  }
  return trimmed
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export class CreateBuildingStockAlertDto {
  /** Compat: un solo producto. Preferí `productIds` para reportes múltiples. */
  @ValidateIf((o: CreateBuildingStockAlertDto) => !o.productIds?.length)
  @IsUUID()
  productId?: string;

  @IsOptional()
  @Transform(({ value }) => parseProductIds(value))
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  productIds?: string[];

  @IsIn([...BUILDING_STOCK_ALERT_TYPES])
  alertType!: (typeof BUILDING_STOCK_ALERT_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
