import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { QueryStockMovementsDto } from './dto/query-stock-movements.dto';
import { toNumber } from './stock-logistics.helpers';

const MOVEMENT_SELECT = {
  id: true,
  scope: true,
  movementType: true,
  productId: true,
  buildingId: true,
  quantityBefore: true,
  quantityDelta: true,
  quantityAfter: true,
  reservedBefore: true,
  reservedDelta: true,
  reservedAfter: true,
  note: true,
  occurredAt: true,
  performedBy: { select: { id: true, fullName: true } },
  building: { select: { id: true, name: true } },
  shipmentOrder: { select: { id: true, reference: true } },
  shipmentDestination: {
    select: {
      id: true,
      deliveredAt: true,
      confirmedBy: { select: { id: true, fullName: true } },
    },
  },
} as const;

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryStockMovementsDto) {
    const limit = query.limit ?? 50;

    const where: Prisma.StockMovementWhereInput = {
      productId: query.productId,
      ...(query.buildingId
        ? {
            OR: [
              { buildingId: query.buildingId },
              { shipmentDestination: { buildingId: query.buildingId } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.stockMovement.findMany({
      where,
      select: MOVEMENT_SELECT,
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    return rows.map((row) => this.mapMovement(row));
  }

  private mapMovement(row: Prisma.StockMovementGetPayload<{ select: typeof MOVEMENT_SELECT }>) {
    return {
      id: row.id,
      scope: row.scope,
      movementType: row.movementType,
      productId: row.productId,
      buildingId: row.buildingId,
      building: row.building,
      quantityBefore: toNumber(row.quantityBefore),
      quantityDelta: toNumber(row.quantityDelta),
      quantityAfter: toNumber(row.quantityAfter),
      reservedBefore: row.reservedBefore != null ? toNumber(row.reservedBefore) : null,
      reservedDelta: row.reservedDelta != null ? toNumber(row.reservedDelta) : null,
      reservedAfter: row.reservedAfter != null ? toNumber(row.reservedAfter) : null,
      note: row.note,
      occurredAt: row.occurredAt.toISOString(),
      performedBy: row.performedBy,
      shipmentOrder: row.shipmentOrder,
      shipmentDestination: row.shipmentDestination
        ? {
            id: row.shipmentDestination.id,
            deliveredAt: row.shipmentDestination.deliveredAt?.toISOString() ?? null,
            confirmedBy: row.shipmentDestination.confirmedBy,
          }
        : null,
    };
  }
}
