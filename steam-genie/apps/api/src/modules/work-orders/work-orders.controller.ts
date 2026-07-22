import {
  Controller,
  Get,
  Post,
  Delete,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WorkOrderAssignmentGuard } from './guards/work-order-assignment.guard';
import { WorkOrdersService } from './work-orders.service';
import { QueryWorkOrdersDto } from './dto/query-work-orders.dto';
import { AssignWorkOrderDto } from './dto/assign-work-order.dto';
import { RejectWorkOrderDto } from './dto/reject-work-order.dto';
import { CreateCheckoutCleaningDto } from './dto/create-checkout-cleaning.dto';
import { CreateAdditionalRequestDto } from './dto/create-additional-request.dto';
import type { AuthUser } from '@steam-genie/shared-types';

@Controller('work-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Get()
  @RequiredRoles('admin', 'manager', 'cleaner', 'client', 'provider')
  findAll(@Query() query: QueryWorkOrdersDto, @CurrentUser() user: AuthUser) {
    return this.workOrdersService.findAll(query, user);
  }

  @Post('checkout-cleaning')
  @RequiredRoles('admin', 'manager')
  createCheckoutCleaning(
    @Body() dto: CreateCheckoutCleaningDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workOrdersService.createCheckoutCleaning(dto, user.id);
  }

  @Post('additional-request')
  @RequiredRoles('client')
  createAdditionalRequest(
    @Body() dto: CreateAdditionalRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workOrdersService.createAdditionalRequest(dto, user.id);
  }

  @Delete('purge-all')
  @RequiredRoles('admin')
  purgeAll(@Query('confirm') confirm?: string) {
    return this.workOrdersService.purgeAll(confirm ?? '');
  }

  @Get(':id')
  @RequiredRoles('admin', 'manager', 'cleaner', 'client', 'provider')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.workOrdersService.findOne(id, user);
  }

  @Post(':id/assign')
  @RequiredRoles('admin', 'manager')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignWorkOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workOrdersService.assign(id, dto, user.id);
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

  @Post(':id/complete')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: AuthUser },
  ) {
    return this.workOrdersService.complete(id, req.user);
  }

  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workOrdersService.remove(id, user);
  }
}
