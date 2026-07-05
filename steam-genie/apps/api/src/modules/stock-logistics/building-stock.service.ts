import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UpsertBuildingStockDto } from './dto/upsert-building-stock.dto';
import { toNumber } from './stock-logistics.helpers';
import { recordStockMovement } from './stock-movements.record';

const ITEM_SELECT = {
  id: true,
  buildingId: true,
  productId: true,
  quantity: true,
  createdAt: true,
  updatedAt: true,
  product: {
    select: {
      id: true,
      name: true,
      sku: true,
      unitType: true,
      isActive: true,
      category: { select: { id: true, name: true, sortOrder: true } },
    },
  },
} as const;

@Injectable()
export class BuildingStockService {
  constructor(private readonly prisma: PrismaService) {}

  async listByBuilding(buildingId: string) {
    await this.assertBuilding(buildingId);

    const items = await this.prisma.buildingStockItem.findMany({
      where: { buildingId },
      select: ITEM_SELECT,
      orderBy: [{ product: { category: { sortOrder: 'asc' } } }, { product: { name: 'asc' } }],
    });

    return items.map((item) => this.mapItem(item));
  }

  async upsert(buildingId: string, dto: UpsertBuildingStockDto, performedById: string) {
    await this.assertBuilding(buildingId);

    const product = await this.prisma.stockProduct.findFirst({
      where: { id: dto.productId, deletedAt: null, isActive: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado en depósito');

    const item = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.buildingStockItem.findUnique({
        where: {
          buildingId_productId: { buildingId, productId: dto.productId },
        },
      });
      const qtyBefore = existing ? toNumber(existing.quantity) : 0;

      const saved = await tx.buildingStockItem.upsert({
        where: {
          buildingId_productId: { buildingId, productId: dto.productId },
        },
        create: {
          buildingId,
          productId: dto.productId,
          quantity: dto.quantity,
        },
        update: { quantity: dto.quantity },
        select: ITEM_SELECT,
      });

      if (dto.quantity !== qtyBefore) {
        await recordStockMovement(tx, {
          scope: 'BUILDING',
          movementType: 'BUILDING_SET',
          productId: dto.productId,
          buildingId,
          quantityBefore: qtyBefore,
          quantityDelta: dto.quantity - qtyBefore,
          quantityAfter: dto.quantity,
          performedById,
        });
      }

      return saved;
    });

    return this.mapItem(item);
  }

  private async assertBuilding(buildingId: string) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, deletedAt: null, isActive: true },
    });
    if (!building) throw new NotFoundException('Edificio no encontrado');
    return building;
  }

  private mapItem(item: {
    id: string;
    buildingId: string;
    productId: string;
    quantity: { toNumber(): number } | number;
    createdAt: Date;
    updatedAt: Date;
    product: {
      id: string;
      name: string;
      sku: string | null;
      unitType: string;
      isActive: boolean;
      category: { id: string; name: string; sortOrder: number };
    };
  }) {
    return {
      ...item,
      quantity: toNumber(item.quantity as never),
    };
  }
}
