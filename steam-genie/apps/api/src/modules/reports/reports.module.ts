import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsExportService } from './reports-export.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModulesGuard } from '../../common/guards/modules.guard';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService, RolesGuard, ModulesGuard],
})
export class ReportsModule {}
