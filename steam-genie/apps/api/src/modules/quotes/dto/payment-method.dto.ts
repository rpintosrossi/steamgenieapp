import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreatePaymentMethodDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdatePaymentMethodDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryPaymentMethodsDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}

export class QuotePaymentInputDto {
  @IsUUID()
  paymentMethodId!: string;

  @IsBoolean()
  isPending!: boolean;

  @ValidateIf((o: QuotePaymentInputDto) => !o.isPending)
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100)
  percent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
