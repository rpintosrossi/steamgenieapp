import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { QuoteItemDto } from './quote-item.dto';

export class CreateQuoteDto {
  @IsOptional()
  @IsUUID()
  particularClientId?: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsDateString()
  requestDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  serviceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clientDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sellerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentCondition?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observations?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];
}
