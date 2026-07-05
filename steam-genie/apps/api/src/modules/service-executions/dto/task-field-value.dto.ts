import { IsArray, IsUUID, ArrayUnique } from 'class-validator';

export class TaskFieldValueDto {
  @IsUUID()
  fieldId!: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  selectedOptionIds!: string[];
}
