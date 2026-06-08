import { Module } from '@nestjs/common';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrderAssignmentGuard } from './guards/work-order-assignment.guard';

@Module({
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, WorkOrderAssignmentGuard],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}

