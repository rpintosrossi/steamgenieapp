import {
  Controller,
  Delete,
  Get,
  Param,
  Res,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TaskPhotosService } from './task-photos.service';
import type { AuthUser } from '@steam-genie/shared-types';

@Controller('task-photos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaskPhotosController {
  constructor(private readonly taskPhotosService: TaskPhotosService) {}

  /**
   * Streams the photo file for local storage.
   * In production with S3/R2, clients use the public URL returned by the upload endpoint.
   */
  @Get('serve/:key')
  serveByStorageKey(
    @Param('key') encodedKey: string,
    @Res() res: Response,
  ) {
    return this.taskPhotosService.serveByKey(decodeURIComponent(encodedKey), res);
  }

  @Get(':id/file')
  serveFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    return this.taskPhotosService.serveFile(id, res);
  }

  /**
   * Soft-delete a photo.
   * MVP: admin or manager only.
   */
  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.taskPhotosService.softDelete(id, user);
  }
}
