import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export enum ParticularClientAction {
  CREATE_NEW = 'CREATE_NEW',
  USE_EXISTING = 'USE_EXISTING',
}

export class ConvertQuoteDto {
  /**
   * Una o más fechas/horas ISO del servicio.
   * Cada entrada genera un WorkOrder (útil para trabajos multi-día no consecutivos).
   */
  @IsArray()
  @ArrayMinSize(1)
  @IsISO8601({}, { each: true })
  scheduledAts!: string[];

  @IsOptional()
  @IsUUID()
  floorId?: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsUUID()
  subzoneId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Solo para presupuestos de cliente eventual con coincidencias de dirección.
   * CREATE_NEW = alta de cliente particular; USE_EXISTING = reutilizar uno existente.
   */
  @IsOptional()
  @IsEnum(ParticularClientAction)
  particularClientAction?: ParticularClientAction;

  @ValidateIf((o: ConvertQuoteDto) => o.particularClientAction === ParticularClientAction.USE_EXISTING)
  @IsUUID()
  particularClientId?: string;
}
