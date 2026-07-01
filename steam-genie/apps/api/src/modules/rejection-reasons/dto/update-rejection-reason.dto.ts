import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateRejectionReasonDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  text?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
