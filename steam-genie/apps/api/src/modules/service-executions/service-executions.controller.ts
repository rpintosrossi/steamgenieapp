import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ServiceExecutionsService } from './service-executions.service';

@Controller('service-executions')
@UseGuards(JwtAuthGuard)
export class ServiceExecutionsController {
  constructor(private readonly serviceExecutionsService: ServiceExecutionsService) {}

  // TODO: PUT /:serviceExecutionId/work-order-tasks/:workOrderTaskId
  // TODO: GET /:serviceExecutionId/tasks
}