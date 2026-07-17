import { Module } from '@nestjs/common';
import { BulkImportController } from './bulk-import.controller';
import { BulkImportService } from './bulk-import.service';
import { TasksModule } from '../tasks/tasks.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';

@Module({
  imports: [TasksModule, GeocodingModule],
  controllers: [BulkImportController],
  providers: [BulkImportService, RolesGuard, BuildingAccessGuard],
})
export class BulkImportModule {}
