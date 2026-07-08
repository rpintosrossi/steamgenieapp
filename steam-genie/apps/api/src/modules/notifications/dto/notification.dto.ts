import { IsArray, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { NotificationData } from '../notifications.types';

export class SendTestNotificationDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body!: string;

  @IsOptional()
  @IsObject()
  data?: NotificationData;
}

export class EnqueueNotificationDto {
  @IsArray()
  @IsUUID('4', { each: true })
  userIds!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body!: string;

  @IsOptional()
  @IsObject()
  data?: NotificationData;
}
