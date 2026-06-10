import { Module } from '@nestjs/common';
import { TaskPhotosController } from './task-photos.controller';
import { TaskPhotosService } from './task-photos.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [TaskPhotosController],
  providers: [TaskPhotosService, RolesGuard],
  exports: [TaskPhotosService],
})
export class TaskPhotosModule {}
