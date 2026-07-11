import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryCommissionServicesDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @IsOptional()
  @IsUUID()
  cleanerId?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;

  /** all | with_amount | without_amount */
  @IsOptional()
  @IsString()
  amountFilter?: 'all' | 'with_amount' | 'without_amount';
}

export class CreateCommissionSettlementDto {
  @ValidateIf((o: CreateCommissionSettlementDto) => !o.externalBeneficiaryName)
  @IsUUID()
  beneficiaryUserId?: string;

  @ValidateIf((o: CreateCommissionSettlementDto) => !o.beneficiaryUserId)
  @IsString()
  @MaxLength(200)
  externalBeneficiaryName?: string;

  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  percentage!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  workOrderIds!: string[];

  /** Fixed expense IDs to exclude from the default set. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludedFixedExpenseIds?: string[];
}

export class UpdateCommissionSettlementItemDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  clientAmountCharged?: number;
}

export class UpdateCommissionFixedLineDto {
  @IsUUID()
  id!: string;

  @IsBoolean()
  included!: boolean;
}

export class UpdateCommissionSettlementDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCommissionSettlementItemDto)
  items?: UpdateCommissionSettlementItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCommissionFixedLineDto)
  fixedExpenses?: UpdateCommissionFixedLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  versionNote?: string;
}

export class QuerySettlementsDto {
  @IsOptional()
  @IsUUID()
  beneficiaryUserId?: string;

  @IsOptional()
  @IsString()
  beneficiaryName?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}
