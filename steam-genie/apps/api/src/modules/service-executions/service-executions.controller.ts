import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ServiceExecutionsService } from './service-executions.service';
import { MarkTaskDto } from './dto/mark-task.dto';
import type { AuthUser } from '@steam-genie/shared-types';

@Controller('service-executions')
@UseGuards(JwtAuthGuard)
export class ServiceExecutionsController {
  constructor(
    private readonly serviceExecutionsService: ServiceExecutionsService,
  ) {}

  @Get(':id/tasks')
  getTasks(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceExecutionsService.getTasksForExecution(id, user);
  }

  @Put(':id/work-order-tasks/:workOrderTaskId')
  markTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workOrderTaskId', ParseUUIDPipe) workOrderTaskId: string,
    @Body() dto: MarkTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceExecutionsService.markTask(id, workOrderTaskId, dto, user);
  }
}
