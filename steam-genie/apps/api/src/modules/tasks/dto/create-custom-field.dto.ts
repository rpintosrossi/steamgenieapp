import { IsString, MinLength, MaxLength, IsOptional, IsBoolean, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskFieldType } from '@prisma/client';

export class CreateCustomFieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @IsEnum(TaskFieldType)
  fieldType!: TaskFieldType;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  showInReport?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
