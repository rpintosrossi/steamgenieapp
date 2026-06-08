import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateZoneDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
