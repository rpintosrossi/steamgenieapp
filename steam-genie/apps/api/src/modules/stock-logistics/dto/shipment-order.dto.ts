import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class ShipmentLineInputDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

class ShipmentDestinationInputDto {
  @IsUUID()
  buildingId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShipmentLineInputDto)
  lines!: ShipmentLineInputDto[];
}

export class CreateShipmentOrderDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShipmentDestinationInputDto)
  destinations!: ShipmentDestinationInputDto[];
}

export class UpdateShipmentOrderDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShipmentDestinationInputDto)
  destinations?: ShipmentDestinationInputDto[];
}

class DispatchDestinationDto {
  @IsUUID()
  destinationId!: string;

  @IsDateString()
  deliveryDate!: string;
}

export class DispatchShipmentOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DispatchDestinationDto)
  destinations!: DispatchDestinationDto[];
}
