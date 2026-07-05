import { Injectable } from '@nestjs/common';
import { computeStockStatus } from '@steam-genie/shared-constants';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { QueryStockMonitoringDto } from './dto/query-stock-monitoring.dto';
import { toNumber } from './stock-logistics.helpers';

@Injectable()
export class StockMonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async getMatrix(query: QueryStockMonitoringDto) {
    const buildings = await this.prisma.building.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(query.buildingId ? { id: query.buildingId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const buildingIds = buildings.map((b) => b.id);

    const stockItems = await this.prisma.buildingStockItem.findMany({
      where: {
        buildingId: { in: buildingIds },
        ...(query.categoryId
          ? { product: { categoryId: query.categoryId } }
          : {}),
        ...(query.search?.trim()
          ? {
              product: {
                name: { contains: query.search.trim(), mode: 'insensitive' },
              },
            }
          : {}),
      },
      select: {
        buildingId: true,
        productId: true,
        quantity: true,
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unitType: true,
            category: { select: { id: true, name: true, sortOrder: true } },
          },
        },
      },
    });

    const alerts = await this.prisma.buildingStockAlert.findMany({
      where: {
        buildingId: { in: buildingIds },
        status: { in: ['OPEN', 'IN_TRANSIT'] },
      },
      select: {
        id: true,
        buildingId: true,
        productId: true,
        alertType: true,
        status: true,
        deliveryDate: true,
        note: true,
        createdAt: true,
      },
    });

    const alertMap = new Map<string, (typeof alerts)[number]>();
    for (const alert of alerts) {
      alertMap.set(`${alert.buildingId}:${alert.productId}`, alert);
    }

    const productMap = new Map<
      string,
      {
        id: string;
        name: string;
        sku: string | null;
        unitType: string;
        category: { id: string; name: string; sortOrder: number };
      }
    >();

    const cells: Array<{
      buildingId: string;
      productId: string;
      quantity: number;
      alert: (typeof alerts)[number] | null;
    }> = [];

    for (const item of stockItems) {
      productMap.set(item.productId, item.product);
      const alert = alertMap.get(`${item.buildingId}:${item.productId}`) ?? null;
      cells.push({
        buildingId: item.buildingId,
        productId: item.productId,
        quantity: toNumber(item.quantity),
        alert,
      });
    }

    let products = [...productMap.values()].sort(
      (a, b) =>
        a.category.sortOrder - b.category.sortOrder ||
        a.category.name.localeCompare(b.category.name) ||
        a.name.localeCompare(b.name),
    );

    if (query.alertsOnly) {
      const alertProductIds = new Set(
        cells.filter((c) => c.alert).map((c) => c.productId),
      );
      products = products.filter((p) => alertProductIds.has(p.id));
    }

    const depotProducts = await this.prisma.stockProduct.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        quantity: true,
        reservedQuantity: true,
        minQuantity: true,
        unitType: true,
      },
    });

    const depotStats = {
      totalProducts: depotProducts.length,
      lowStock: 0,
      outOfStock: 0,
    };

    for (const product of depotProducts) {
      const available = toNumber(product.quantity) - toNumber(product.reservedQuantity);
      const status = computeStockStatus(available, toNumber(product.minQuantity));
      if (status === 'OUT') depotStats.outOfStock += 1;
      else if (status === 'LOW') depotStats.lowStock += 1;
    }

    const openAlerts = alerts.filter((a) => a.status === 'OPEN').length;
    const inTransitAlerts = alerts.filter((a) => a.status === 'IN_TRANSIT').length;

    return {
      depotStats,
      buildingAlertStats: {
        open: openAlerts,
        inTransit: inTransitAlerts,
      },
      buildings,
      products,
      cells: query.alertsOnly
        ? cells.filter((c) => c.alert && products.some((p) => p.id === c.productId))
        : cells.filter((c) => products.some((p) => p.id === c.productId)),
    };
  }
}
