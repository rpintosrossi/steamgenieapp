import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { AttendanceModule } from '../attendance/attendance.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { ServiceExecutionsModule } from '../service-executions/service-executions.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [AttendanceModule, WorkOrdersModule, ServiceExecutionsModule, TasksModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
