import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { CustomFieldsController } from './custom-fields.controller';
import { FieldOptionsController } from './field-options.controller';
import { TasksService } from './tasks.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [TasksController, CustomFieldsController, FieldOptionsController],
  providers: [TasksService, RolesGuard],
  exports: [TasksService],
})
export class TasksModule {}
