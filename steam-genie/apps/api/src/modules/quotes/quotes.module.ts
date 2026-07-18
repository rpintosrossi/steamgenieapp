import { Module } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { QuotePdfService } from './quote-pdf.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkOrdersModule } from '../work-orders/work-orders.module';

@Module({
  imports: [WorkOrdersModule],
  controllers: [QuotesController],
  providers: [QuotesService, QuotePdfService, RolesGuard],
  exports: [QuotesService],
})
export class QuotesModule {}
