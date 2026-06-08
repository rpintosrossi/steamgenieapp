import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateSubzoneDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
