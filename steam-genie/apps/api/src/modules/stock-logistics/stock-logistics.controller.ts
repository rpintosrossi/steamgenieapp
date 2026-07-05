import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { APP_MODULES } from '@steam-genie/shared-constants';
import type { AuthUser } from '@steam-genie/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModulesGuard } from '../../common/guards/modules.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiredModules } from '../../common/decorators/required-modules.decorator';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { BuildingStockAlertsService } from './building-stock-alerts.service';
import { BuildingStockService } from './building-stock.service';
import { StockMonitoringService } from './stock-monitoring.service';
import { StockShipmentsService } from './stock-shipments.service';
import { StockMovementsService } from './stock-movements.service';
import { CreateBuildingStockAlertDto } from './dto/create-building-stock-alert.dto';
import { QueryStockMonitoringDto } from './dto/query-stock-monitoring.dto';
import { QueryStockMovementsDto } from './dto/query-stock-movements.dto';
import {
  CreateShipmentOrderDto,
  DispatchShipmentOrderDto,
  UpdateShipmentOrderDto,
} from './dto/shipment-order.dto';
import { UpsertBuildingStockDto } from './dto/upsert-building-stock.dto';

@Controller('stock-logistics')
@UseGuards(JwtAuthGuard, RolesGuard, ModulesGuard)
export class StockLogisticsController {
  constructor(
    private readonly monitoringService: StockMonitoringService,
    private readonly buildingStockService: BuildingStockService,
    private readonly alertsService: BuildingStockAlertsService,
    private readonly shipmentsService: StockShipmentsService,
    private readonly movementsService: StockMovementsService,
  ) {}

  // ─── Monitoreo ─────────────────────────────────────────────────────────────

  @Get('monitoring')
  @RequiredRoles('admin', 'manager', 'stock')
  @RequiredModules(APP_MODULES.STOCK_MONITORING)
  getMonitoring(@Query() query: QueryStockMonitoringDto) {
    return this.monitoringService.getMatrix(query);
  }

  @Get('alerts')
  @RequiredRoles('admin', 'manager', 'stock')
  @RequiredModules(APP_MODULES.STOCK_MONITORING)
  listAlerts(@Query('buildingId') buildingId?: string) {
    return this.alertsService.listOpenForMonitoring(buildingId);
  }

  @Get('alerts/:id/photo')
  @RequiredRoles('admin', 'manager', 'stock')
  @RequiredModules(APP_MODULES.STOCK_MONITORING)
  serveAlertPhoto(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    return this.alertsService.servePhoto(id, res);
  }

  // ─── Stock por edificio (admin) ────────────────────────────────────────────

  @Get('buildings/:buildingId/items')
  @RequiredRoles('admin', 'manager', 'stock')
  @RequiredModules(APP_MODULES.STOCK, APP_MODULES.STOCK_MONITORING)
  listBuildingStock(@Param('buildingId', ParseUUIDPipe) buildingId: string) {
    return this.buildingStockService.listByBuilding(buildingId);
  }

  @Post('buildings/:buildingId/items')
  @RequiredRoles('admin', 'manager', 'stock')
  @RequiredModules(APP_MODULES.STOCK)
  upsertBuildingStock(
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertBuildingStockDto,
  ) {
    return this.buildingStockService.upsert(buildingId, dto, user.id);
  }

  @Get('movements')
  @RequiredRoles('admin', 'manager', 'stock')
  @RequiredModules(APP_MODULES.STOCK, APP_MODULES.STOCK_MONITORING)
  listMovements(@Query() query: QueryStockMovementsDto) {
    return this.movementsService.list(query);
  }

  // ─── Órdenes de envío ──────────────────────────────────────────────────────

  @Get('shipments')
  @RequiredRoles('admin', 'manager', 'stock')
  @RequiredModules(APP_MODULES.STOCK_SHIPMENTS)
  listShipments() {
    return this.shipmentsService.findAll();
  }

  @Get('shipments/:id')
  @RequiredRoles('admin', 'manager', 'stock')
  @RequiredModules(APP_MODULES.STOCK_SHIPMENTS)
  getShipment(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipmentsService.findOne(id);
  }

  @Post('shipments')
  @RequiredRoles('admin', 'manager', 'stock')
  @RequiredModules(APP_MODULES.STOCK_SHIPMENTS)
  createShipment(@CurrentUser() user: AuthUser, @Body() dto: CreateShipmentOrderDto) {
    return this.shipmentsService.create(user, dto);
  }

  @Patch('shipments/:id')
  @RequiredRoles('admin', 'manager', 'stock')
  @RequiredModules(APP_MODULES.STOCK_SHIPMENTS)
  updateShipment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShipmentOrderDto,
  ) {
    return this.shipmentsService.update(id, dto);
  }

  @Post('shipments/:id/dispatch')
  @RequiredRoles('admin', 'manager', 'stock')
  @RequiredModules(APP_MODULES.STOCK_SHIPMENTS)
  dispatchShipment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: DispatchShipmentOrderDto,
  ) {
    return this.shipmentsService.dispatch(id, user, dto);
  }

  @Post('shipments/destinations/:destinationId/deliver')
  @RequiredRoles('admin', 'manager', 'cleaner', 'stock')
  deliverDestination(
    @Param('destinationId', ParseUUIDPipe) destinationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shipmentsService.deliverDestination(destinationId, user);
  }

  @Post('shipments/destinations/:destinationId/cancel')
  @RequiredRoles('admin', 'manager', 'stock')
  @RequiredModules(APP_MODULES.STOCK_SHIPMENTS)
  cancelDestination(
    @Param('destinationId', ParseUUIDPipe) destinationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shipmentsService.cancelDestination(destinationId, user);
  }

  // ─── Mobile (limpiadores fichados) ───────────────────────────────────────

  @Get('mobile/buildings/:buildingId')
  @RequiredRoles('cleaner', 'admin', 'manager')
  getMobileBuildingStock(
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.alertsService.getMobileBuildingStock(buildingId, user.id);
  }

  @Post('mobile/buildings/:buildingId/alerts')
  @RequiredRoles('cleaner')
  @UseInterceptors(FileInterceptor('photo'))
  createMobileAlert(
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBuildingStockAlertDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.alertsService.create(user, buildingId, dto, file);
  }
}
