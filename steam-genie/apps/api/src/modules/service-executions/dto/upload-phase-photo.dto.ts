import { IsEnum } from 'class-validator';
import { PhotoPhase } from '@prisma/client';
import { UploadPhotoDto } from './upload-photo.dto';

export class UploadPhasePhotoDto extends UploadPhotoDto {
  @IsEnum(PhotoPhase)
  phase!: PhotoPhase;
}
