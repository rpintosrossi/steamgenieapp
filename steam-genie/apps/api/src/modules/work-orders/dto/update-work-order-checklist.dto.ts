import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateChecklistTaskItemDto {
  /** Id del snapshot existente. Si se omite, se crea una tarea nueva. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  name!: string;

  @IsOptional()
  @IsBoolean()
  allowsPhoto?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresPhoto?: boolean;
}

export class UpdateWorkOrderChecklistDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateChecklistTaskItemDto)
  tasks!: UpdateChecklistTaskItemDto[];
}
