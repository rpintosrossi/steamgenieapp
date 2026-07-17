import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ServiceExecutionsService } from './service-executions.service';
import { MarkTaskDto } from './dto/mark-task.dto';
import { UploadPhotoDto } from './dto/upload-photo.dto';
import { UploadPhasePhotoDto } from './dto/upload-phase-photo.dto';
import type { AuthUser } from '@steam-genie/shared-types';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

@Controller('service-executions')
@UseGuards(JwtAuthGuard)
export class ServiceExecutionsController {
  constructor(
    private readonly serviceExecutionsService: ServiceExecutionsService,
  ) {}

  @Get(':id/tasks')
  getTasks(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceExecutionsService.getTasksForExecution(id, user);
  }

  @Put(':id/work-order-tasks/:workOrderTaskId')
  markTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workOrderTaskId', ParseUUIDPipe) workOrderTaskId: string,
    @Body() dto: MarkTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceExecutionsService.markTask(id, workOrderTaskId, dto, user);
  }

  @Post(':id/work-order-tasks/:workOrderTaskId/photos')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Invalid file type "${file.mimetype}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workOrderTaskId', ParseUUIDPipe) workOrderTaskId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPhotoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceExecutionsService.uploadPhoto(id, workOrderTaskId, file, dto, user);
  }

  @Get(':id/work-order-tasks/:workOrderTaskId/photos')
  getPhotos(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workOrderTaskId', ParseUUIDPipe) workOrderTaskId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceExecutionsService.getPhotosForTask(id, workOrderTaskId, user);
  }

  @Post(':id/phase-photos')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Invalid file type "${file.mimetype}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  uploadPhasePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPhasePhotoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceExecutionsService.uploadPhasePhoto(id, file, dto, user);
  }

  @Get(':id/phase-photos')
  getPhasePhotos(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceExecutionsService.getPhasePhotos(id, user);
  }

  @Delete(':id/phase-photos/:photoId')
  deletePhasePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceExecutionsService.deletePhasePhoto(id, photoId, user);
  }
}
