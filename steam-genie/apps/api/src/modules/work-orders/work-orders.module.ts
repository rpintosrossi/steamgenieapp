import { Module } from '@nestjs/common';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrderAssignmentGuard } from './guards/work-order-assignment.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, WorkOrderAssignmentGuard, RolesGuard],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}

