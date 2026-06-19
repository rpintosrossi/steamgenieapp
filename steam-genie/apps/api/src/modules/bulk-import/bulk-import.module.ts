import { Module } from '@nestjs/common';
import { BulkImportController } from './bulk-import.controller';
import { BulkImportService } from './bulk-import.service';
import { TasksModule } from '../tasks/tasks.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [TasksModule],
  controllers: [BulkImportController],
  providers: [BulkImportService, RolesGuard],
})
export class BulkImportModule {}
