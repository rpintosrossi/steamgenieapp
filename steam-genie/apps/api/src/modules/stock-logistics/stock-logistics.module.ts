import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModulesGuard } from '../../common/guards/modules.guard';
import { StockLogisticsController } from './stock-logistics.controller';
import { StockMonitoringService } from './stock-monitoring.service';
import { BuildingStockService } from './building-stock.service';
import { BuildingStockAlertsService } from './building-stock-alerts.service';
import { StockShipmentsService } from './stock-shipments.service';
import { StockMovementsModule } from './stock-movements.module';

@Module({
  imports: [UsersModule, StockMovementsModule, NotificationsModule],
  controllers: [StockLogisticsController],
  providers: [
    StockMonitoringService,
    BuildingStockService,
    BuildingStockAlertsService,
    StockShipmentsService,
    RolesGuard,
    ModulesGuard,
  ],
  exports: [
    StockMonitoringService,
    BuildingStockService,
    BuildingStockAlertsService,
    StockShipmentsService,
    StockMovementsModule,
  ],
})
export class StockLogisticsModule {}
