import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { WorkOrderAssignmentGuard } from './guards/work-order-assignment.guard';
import { WorkOrdersService } from './work-orders.service';
import { QueryWorkOrdersDto } from './dto/query-work-orders.dto';
import { AssignWorkOrderDto } from './dto/assign-work-order.dto';
import { RejectWorkOrderDto } from './dto/reject-work-order.dto';
import type { AuthUser } from '@steam-genie/shared-types';

@Controller('work-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Get()
  @RequiredRoles('admin', 'manager', 'cleaner')
  findAll(@Query() query: QueryWorkOrdersDto) {
    return this.workOrdersService.findAll(query);
  }

  @Get(':id')
  @RequiredRoles('admin', 'manager', 'cleaner')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.workOrdersService.findOne(id);
  }

  @Post(':id/assign')
  @RequiredRoles('admin', 'manager')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignWorkOrderDto,
  ) {
    return this.workOrdersService.assign(id, dto);
  }

  @Post(':id/accept')
  @UseGuards(WorkOrderAssignmentGuard)
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: AuthUser },
  ) {
    return this.workOrdersService.accept(id, req.user);
  }

  @Post(':id/reject')
  @UseGuards(WorkOrderAssignmentGuard)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectWorkOrderDto,
    @Request() req: { user: AuthUser },
  ) {
    return this.workOrdersService.reject(id, dto, req.user);
  }

  @Post(':id/start')
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: AuthUser },
  ) {
    return this.workOrdersService.start(id, req.user);
  }
}
