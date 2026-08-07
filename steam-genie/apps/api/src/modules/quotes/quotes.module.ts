import { Module } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { QuotePdfService } from './quote-pdf.service';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkOrdersModule } from '../work-orders/work-orders.module';

@Module({
  imports: [WorkOrdersModule],
  controllers: [QuotesController, PaymentMethodsController],
  providers: [QuotesService, QuotePdfService, PaymentMethodsService, RolesGuard],
  exports: [QuotesService],
})
export class QuotesModule {}
