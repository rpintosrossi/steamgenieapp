import { Module } from '@nestjs/common';
import { ModulesGuard } from '../../common/guards/modules.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UsersModule } from '../users/users.module';
import { CommissionPdfService } from './commission-pdf.service';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { ExpensesController } from './expenses.controller';
import { FixedExpensesService, WorkOrderExpensesService } from './expenses.service';

@Module({
  imports: [UsersModule],
  controllers: [ExpensesController, CommissionsController],
  providers: [
    WorkOrderExpensesService,
    FixedExpensesService,
    CommissionsService,
    CommissionPdfService,
    RolesGuard,
    ModulesGuard,
  ],
})
export class FinanceModule {}
