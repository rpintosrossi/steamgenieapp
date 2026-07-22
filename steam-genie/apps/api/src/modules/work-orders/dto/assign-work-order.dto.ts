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

export class ChecklistTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name!: string;

  @IsOptional()
  @IsBoolean()
  requiresPhoto?: boolean;
}

export class AssignWorkOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  userIds!: string[];

  /** Checklist custom requerido al asignar servicios en estado QUOTE_ACCEPTED sin tareas. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChecklistTaskDto)
  checklistTasks?: ChecklistTaskDto[];
}
