import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWorkOrderExpenseDto {
  @IsString()
  @MaxLength(300)
  concept!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;
}

export class UpdateWorkOrderExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  concept?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;
}

export class UpdateClientAmountDto {
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  clientAmountCharged!: number | null;
}

export class CreateFixedExpenseDto {
  @IsString()
  @MaxLength(300)
  concept!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsUUID()
  buildingId?: string | null;
}

export class UpdateFixedExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  concept?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsUUID()
  buildingId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
