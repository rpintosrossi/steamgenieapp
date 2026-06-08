import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsBoolean,
  IsISO8601,
  IsArray,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InitialRoleDto {
  @IsUUID()
  roleId!: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;
}

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^\d+$/, { message: 'DNI must contain only digits' })
  dni!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitialRoleDto)
  initialRoles?: InitialRoleDto[];
}
