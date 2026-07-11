import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateTaskCategoryDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
