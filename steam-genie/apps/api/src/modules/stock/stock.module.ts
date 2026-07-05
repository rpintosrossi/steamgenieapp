import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StockMovementsModule } from '../stock-logistics/stock-movements.module';

@Module({
  imports: [StockMovementsModule],
  controllers: [StockController],
  providers: [StockService, RolesGuard],
  exports: [StockService],
})
export class StockModule {}
