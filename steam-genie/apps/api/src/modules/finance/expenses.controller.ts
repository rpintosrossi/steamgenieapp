import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { APP_MODULES } from '@steam-genie/shared-constants';
import type { AuthUser } from '@steam-genie/shared-types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiredModules } from '../../common/decorators/required-modules.decorator';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModulesGuard } from '../../common/guards/modules.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateFixedExpenseDto,
  CreateWorkOrderExpenseDto,
  UpdateClientAmountDto,
  UpdateFixedExpenseDto,
  UpdateWorkOrderExpenseDto,
} from './dto/expenses.dto';
import { FixedExpensesService, WorkOrderExpensesService } from './expenses.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, ModulesGuard)
export class ExpensesController {
  constructor(
    private readonly workOrderExpenses: WorkOrderExpensesService,
    private readonly fixedExpenses: FixedExpensesService,
  ) {}

  // ─── Gastos por servicio ───────────────────────────────────────────────────

  @Get('work-orders/:id/finance')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.GASTOS_SERVICIOS, APP_MODULES.COMISIONES)
  getWorkOrderFinance(@Param('id', ParseUUIDPipe) id: string) {
    return this.workOrderExpenses.getFinance(id);
  }

  @Patch('work-orders/:id/client-amount')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.GASTOS_SERVICIOS, APP_MODULES.COMISIONES)
  updateClientAmount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientAmountDto,
  ) {
    return this.workOrderExpenses.updateClientAmount(id, dto);
  }

  @Post('work-orders/:id/expenses')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.GASTOS_SERVICIOS, APP_MODULES.COMISIONES)
  createExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWorkOrderExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workOrderExpenses.createExpense(id, dto, user.id);
  }

  @Patch('work-order-expenses/:expenseId')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.GASTOS_SERVICIOS, APP_MODULES.COMISIONES)
  updateExpense(
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: UpdateWorkOrderExpenseDto,
  ) {
    return this.workOrderExpenses.updateExpense(expenseId, dto);
  }

  @Delete('work-order-expenses/:expenseId')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.GASTOS_SERVICIOS, APP_MODULES.COMISIONES)
  deleteExpense(@Param('expenseId', ParseUUIDPipe) expenseId: string) {
    return this.workOrderExpenses.deleteExpense(expenseId);
  }

  // ─── Gastos fijos ──────────────────────────────────────────────────────────

  @Get('fixed-expenses')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.GASTOS_FIJOS, APP_MODULES.COMISIONES)
  listFixedExpenses(@Query('includeInactive') includeInactive?: string) {
    return this.fixedExpenses.findAll(includeInactive === 'true');
  }

  @Post('fixed-expenses')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.GASTOS_FIJOS)
  createFixedExpense(@Body() dto: CreateFixedExpenseDto, @CurrentUser() user: AuthUser) {
    return this.fixedExpenses.create(dto, user.id);
  }

  @Patch('fixed-expenses/:id')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.GASTOS_FIJOS)
  updateFixedExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFixedExpenseDto,
  ) {
    return this.fixedExpenses.update(id, dto);
  }

  @Delete('fixed-expenses/:id')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.GASTOS_FIJOS)
  deleteFixedExpense(@Param('id', ParseUUIDPipe) id: string) {
    return this.fixedExpenses.remove(id);
  }
}
