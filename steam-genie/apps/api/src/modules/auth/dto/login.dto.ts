import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^\d+$/, { message: 'DNI must contain only digits' })
  dni!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  password!: string;
}
