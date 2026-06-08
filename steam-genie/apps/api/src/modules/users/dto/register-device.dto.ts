import { IsString, MinLength, MaxLength, IsEnum, IsOptional } from 'class-validator';
import { Platform } from '@prisma/client';

export class RegisterDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  deviceId!: string;

  @IsEnum(Platform)
  platform!: Platform;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pushToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;
}
