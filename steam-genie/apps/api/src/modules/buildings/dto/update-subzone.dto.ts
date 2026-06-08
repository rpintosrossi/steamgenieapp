import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class UpdateSubzoneDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
}
