import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BuildingStockAlertType } from '@prisma/client';
import type { AuthUser } from '@steam-genie/shared-types';
import { Response } from 'express';
import * as path from 'path';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBuildingStockAlertDto } from './dto/create-building-stock-alert.dto';
import { syncBuildingProductsFromShipments } from './stock-logistics.helpers';

const ALERT_SELECT = {
  id: true,
  buildingId: true,
  productId: true,
  alertType: true,
  note: true,
  photoStorageKey: true,
  status: true,
  deliveryDate: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  product: {
    select: {
      id: true,
      name: true,
      unitType: true,
      sku: true,
    },
  },
  shipmentDestination: {
    select: {
      id: true,
      deliveryDate: true,
      order: { select: { id: true, reference: true, status: true } },
    },
  },
} as const;

@Injectable()
export class BuildingStockAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listForBuilding(buildingId: string, includeResolved = false) {
    const rows = await this.prisma.buildingStockAlert.findMany({
      where: {
        buildingId,
        ...(includeResolved ? {} : { status: { not: 'RESOLVED' } }),
      },
      select: {
        ...ALERT_SELECT,
        reportedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.formatAlert(row));
  }

  async listOpenForMonitoring(buildingId?: string) {
    const rows = await this.prisma.buildingStockAlert.findMany({
      where: {
        status: { in: ['OPEN', 'IN_TRANSIT'] },
        ...(buildingId ? { buildingId } : {}),
      },
      select: {
        ...ALERT_SELECT,
        building: { select: { id: true, name: true } },
        reportedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.formatAlert(row));
  }

  async getMobileBuildingStock(buildingId: string, userId: string) {
    await this.assertActiveAttendance(userId, buildingId);

    // Si hubo envíos pero falló el alta de building_stock_items, los reparamos acá.
    await syncBuildingProductsFromShipments(this.prisma, buildingId);

    const [items, alerts, pendingDeliveries] = await Promise.all([
      this.prisma.buildingStockItem.findMany({
        where: { buildingId },
        select: {
          id: true,
          quantity: true,
          product: {
            select: { id: true, name: true, unitType: true, sku: true },
          },
        },
        orderBy: { product: { name: 'asc' } },
      }),
      this.prisma.buildingStockAlert.findMany({
        where: {
          buildingId,
          status: { in: ['OPEN', 'IN_TRANSIT'] },
        },
        select: ALERT_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockShipmentDestination.findMany({
        where: {
          buildingId,
          status: 'PENDING',
          order: { status: 'DISPATCHED' },
        },
        select: {
          id: true,
          deliveryDate: true,
          order: { select: { id: true, reference: true } },
          lines: {
            select: {
              quantity: true,
              product: { select: { id: true, name: true, unitType: true } },
            },
          },
        },
        orderBy: { deliveryDate: 'asc' },
      }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
      })),
      alerts: alerts.map((row) => this.formatAlert(row)),
      pendingDeliveries,
    };
  }

  async create(
    user: AuthUser,
    buildingId: string,
    dto: CreateBuildingStockAlertDto,
    file?: Express.Multer.File,
  ) {
    await this.assertActiveAttendance(user.id, buildingId);

    const productIds = [
      ...new Set([
        ...(dto.productIds ?? []),
        ...(dto.productId ? [dto.productId] : []),
      ]),
    ];
    if (productIds.length === 0) {
      throw new BadRequestException('Seleccioná al menos un producto.');
    }

    const attendance = await this.prisma.attendance.findFirst({
      where: {
        userId: user.id,
        buildingId,
        checkOutAt: null,
        deletedAt: null,
      },
      orderBy: { checkInAt: 'desc' },
    });
    if (!attendance) {
      throw new ForbiddenException('Debés estar fichado en el edificio.');
    }

    const enabledItems = await this.prisma.buildingStockItem.findMany({
      where: { buildingId, productId: { in: productIds } },
      select: {
        productId: true,
        product: { select: { id: true, name: true } },
      },
    });
    const enabledById = new Map(enabledItems.map((item) => [item.productId, item]));
    for (const productId of productIds) {
      if (!enabledById.has(productId)) {
        throw new BadRequestException(
          'Hay productos que no están habilitados en el edificio.',
        );
      }
    }

    const existingAlerts = await this.prisma.buildingStockAlert.findMany({
      where: {
        buildingId,
        productId: { in: productIds },
        status: { in: ['OPEN', 'IN_TRANSIT'] },
      },
      select: {
        productId: true,
        product: { select: { name: true } },
      },
    });
    if (existingAlerts.length > 0) {
      const names = existingAlerts.map((a) => a.product.name).join(', ');
      throw new BadRequestException(
        existingAlerts.length === 1
          ? `Ya existe una alerta activa para «${names}» en el edificio.`
          : `Ya existen alertas activas para: ${names}.`,
      );
    }

    let photoStorageKey: string | null = null;
    if (file) {
      photoStorageKey = `stock-alerts/${buildingId}/${Date.now()}-${file.originalname}`;
      await this.storage.upload(photoStorageKey, file.buffer, file.mimetype);
    }

    const note = dto.note?.trim() || null;
    const alertType = dto.alertType as BuildingStockAlertType;

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const productId of productIds) {
        const row = await tx.buildingStockAlert.create({
          data: {
            buildingId,
            productId,
            reportedById: user.id,
            attendanceId: attendance.id,
            alertType,
            note,
            photoStorageKey,
            status: 'OPEN',
          },
          select: ALERT_SELECT,
        });
        rows.push(row);
      }
      return rows;
    });

    const productNames = created.map((row) => row.product.name);
    const summaryName =
      productNames.length === 1
        ? productNames[0]!
        : `${productNames[0]} y ${productNames.length - 1} más`;

    void this.notificationsService
      .notifyStockAlertCreated({
        alertId: created[0]!.id,
        buildingId,
        productName: summaryName,
      })
      .catch(() => undefined);

    const formatted = created.map((row) => this.formatAlert(row));
    return productIds.length === 1 ? formatted[0]! : formatted;
  }

  async servePhoto(alertId: string, res: Response) {
    const alert = await this.prisma.buildingStockAlert.findUnique({
      where: { id: alertId },
      select: { photoStorageKey: true },
    });
    if (!alert?.photoStorageKey) {
      throw new NotFoundException('La alerta no tiene foto adjunta.');
    }

    const stream = this.storage.getLocalStream(alert.photoStorageKey);
    if (stream) {
      res.setHeader('Content-Type', mimeFromStorageKey(alert.photoStorageKey));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      stream.pipe(res);
      return;
    }

    if (this.storage.usesObjectStorage) {
      res.redirect(302, this.storage.getPublicUrl(alert.photoStorageKey));
      return;
    }

    throw new NotFoundException('Archivo no encontrado.');
  }

  private formatAlert<T extends { id: string; photoStorageKey: string | null }>(alert: T) {
    return {
      ...alert,
      photoUrl: this.buildPhotoUrl(alert),
    };
  }

  private buildPhotoUrl(alert: { id: string; photoStorageKey: string | null }): string | null {
    if (!alert.photoStorageKey) return null;
    if (this.storage.usesObjectStorage && this.storage.hasPublicBaseUrl) {
      return this.storage.getPublicUrl(alert.photoStorageKey);
    }
    return `/stock-logistics/alerts/${alert.id}/photo`;
  }

  private async assertActiveAttendance(userId: string, buildingId: string) {
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        userId,
        buildingId,
        checkOutAt: null,
        deletedAt: null,
      },
    });
    if (!attendance) {
      throw new ForbiddenException('Debés estar fichado en este edificio.');
    }
    return attendance;
  }
}

function mimeFromStorageKey(key: string): string {
  const ext = path.extname(key).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
  };
  return map[ext] ?? 'application/octet-stream';
}
