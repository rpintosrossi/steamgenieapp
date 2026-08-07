import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, StockShipmentOrderStatus } from '@prisma/client';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { recordStockMovement } from './stock-movements.record';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

export type StockMovementMeta = {
  performedById?: string;
  shipmentOrderId?: string;
  shipmentDestinationId?: string;
  shipmentLineId?: string;
  note?: string;
};

export function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : value.toNumber();
}

/** Parsea YYYY-MM-DD como fecha calendario (UTC) para campos @db.Date. */
export function parseDeliveryDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('Fecha de entrega inválida.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Fecha de entrega inválida.');
  }
  return date;
}

export async function assertActiveProduct(
  prisma: PrismaExecutor,
  productId: string,
) {
  const product = await prisma.stockProduct.findFirst({
    where: { id: productId, deletedAt: null, isActive: true },
  });
  if (!product) throw new NotFoundException('Producto de depósito no encontrado');
  return product;
}

export async function assertActiveWarehouse(
  prisma: PrismaExecutor,
  warehouseId: string,
) {
  const warehouse = await prisma.stockWarehouse.findFirst({
    where: { id: warehouseId, deletedAt: null, isActive: true },
  });
  if (!warehouse) throw new NotFoundException('Depósito no encontrado');
  return warehouse;
}

export async function ensureStockBalance(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
  minQuantity = 5,
) {
  return tx.stockBalance.upsert({
    where: { warehouseId_productId: { warehouseId, productId } },
    create: {
      warehouseId,
      productId,
      quantity: 0,
      reservedQuantity: 0,
      minQuantity,
    },
    update: {},
  });
}

export async function assertDepotAvailabilityForTotals(
  prisma: PrismaExecutor,
  warehouseId: string,
  totals: Map<string, number>,
) {
  for (const [productId, totalQty] of totals) {
    const product = await prisma.stockProduct.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const balance = await prisma.stockBalance.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
    });
    const available = balance ? availableDepotQuantity(balance) : 0;
    if (totalQty > available) {
      throw new BadRequestException(
        `Stock insuficiente en depósito para «${product.name}». Disponible: ${available}, solicitado en la orden: ${totalQty}.`,
      );
    }
  }
}

export function aggregateLineQuantities(
  destinations: Array<{ lines: Array<{ productId: string; quantity: Prisma.Decimal | number }> }>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const dest of destinations) {
    for (const line of dest.lines) {
      totals.set(line.productId, (totals.get(line.productId) ?? 0) + toNumber(line.quantity));
    }
  }
  return totals;
}

export async function ensureBuildingStockItem(
  tx: PrismaExecutor,
  buildingId: string,
  productId: string,
) {
  return tx.buildingStockItem.upsert({
    where: { buildingId_productId: { buildingId, productId } },
    create: { buildingId, productId, quantity: 0 },
    update: {},
  });
}

/** Habilita en el edificio todos los productos de destinos de envío (qty 0 si no existían). */
export async function ensureBuildingProductsFromDestinations(
  db: PrismaExecutor,
  destinations: Array<{
    buildingId: string;
    lines: Array<{ productId: string }>;
  }>,
) {
  for (const dest of destinations) {
    if (!dest?.buildingId || !Array.isArray(dest.lines)) continue;
    for (const line of dest.lines) {
      if (!line?.productId) continue;
      await ensureBuildingStockItem(db, dest.buildingId, line.productId);
    }
  }
}

/**
 * Repara edificios que tienen líneas de envío pero sin filas en building_stock_items
 * (p. ej. órdenes creadas cuando falló el ensure post-create).
 */
export async function syncBuildingProductsFromShipments(
  db: PrismaService,
  buildingId: string,
) {
  const lines = await db.stockShipmentLine.findMany({
    where: { destination: { buildingId } },
    select: { productId: true },
    distinct: ['productId'],
  });
  for (const line of lines) {
    await ensureBuildingStockItem(db, buildingId, line.productId);
  }
}

export function availableDepotQuantity(balance: {
  quantity: Prisma.Decimal | number;
  reservedQuantity: Prisma.Decimal | number;
}) {
  return toNumber(balance.quantity) - toNumber(balance.reservedQuantity);
}

export async function reserveDepotStock(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
  amount: number,
  meta?: StockMovementMeta,
) {
  const product = await tx.stockProduct.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundException('Producto no encontrado');

  await ensureStockBalance(tx, warehouseId, productId);
  const balance = await tx.stockBalance.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  if (!balance) throw new NotFoundException('Saldo de depósito no encontrado');

  const available = availableDepotQuantity(balance);
  if (amount > available) {
    throw new BadRequestException(
      `Stock insuficiente en depósito para "${product.name}". Disponible: ${available}`,
    );
  }

  const qtyBefore = toNumber(balance.quantity);
  const reservedBefore = toNumber(balance.reservedQuantity);

  const updated = await tx.stockBalance.update({
    where: { id: balance.id },
    data: {
      reservedQuantity: { increment: amount },
      stockUpdatedAt: new Date(),
    },
  });

  if (meta) {
    await recordStockMovement(tx, {
      scope: 'DEPOT',
      movementType: 'DEPOT_RESERVE',
      productId,
      warehouseId,
      quantityBefore: qtyBefore,
      quantityDelta: 0,
      quantityAfter: qtyBefore,
      reservedBefore,
      reservedDelta: amount,
      reservedAfter: reservedBefore + amount,
      performedById: meta.performedById,
      shipmentOrderId: meta.shipmentOrderId,
      shipmentDestinationId: meta.shipmentDestinationId,
      shipmentLineId: meta.shipmentLineId,
      note: meta.note,
    });
  }

  return updated;
}

export async function releaseDepotReservation(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
  amount: number,
  meta?: StockMovementMeta,
) {
  const balance = await tx.stockBalance.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  if (!balance) throw new NotFoundException('Saldo de depósito no encontrado');

  const reserved = toNumber(balance.reservedQuantity);
  if (amount > reserved) {
    throw new BadRequestException('No hay reserva suficiente para liberar.');
  }

  const qtyBefore = toNumber(balance.quantity);

  const updated = await tx.stockBalance.update({
    where: { id: balance.id },
    data: { reservedQuantity: { decrement: amount } },
  });

  if (meta) {
    await recordStockMovement(tx, {
      scope: 'DEPOT',
      movementType: 'DEPOT_RESERVE_RELEASE',
      productId,
      warehouseId,
      quantityBefore: qtyBefore,
      quantityDelta: 0,
      quantityAfter: qtyBefore,
      reservedBefore: reserved,
      reservedDelta: -amount,
      reservedAfter: reserved - amount,
      performedById: meta.performedById,
      shipmentOrderId: meta.shipmentOrderId,
      shipmentDestinationId: meta.shipmentDestinationId,
      shipmentLineId: meta.shipmentLineId,
      note: meta.note,
    });
  }

  return updated;
}

export async function transferReservedToBuilding(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  buildingId: string,
  productId: string,
  amount: number,
  meta?: StockMovementMeta,
) {
  const balance = await tx.stockBalance.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  if (!balance) throw new NotFoundException('Saldo de depósito no encontrado');

  const reserved = toNumber(balance.reservedQuantity);
  if (amount > reserved) {
    throw new BadRequestException('La reserva no alcanza para confirmar la entrega.');
  }

  const depotQtyBefore = toNumber(balance.quantity);
  const reservedBefore = reserved;

  await tx.stockBalance.update({
    where: { id: balance.id },
    data: {
      quantity: { decrement: amount },
      reservedQuantity: { decrement: amount },
      stockUpdatedAt: new Date(),
    },
  });

  await ensureBuildingStockItem(tx, buildingId, productId);
  const buildingItem = await tx.buildingStockItem.findUnique({
    where: { buildingId_productId: { buildingId, productId } },
  });
  const buildingQtyBefore = buildingItem ? toNumber(buildingItem.quantity) : 0;

  const buildingUpdated = await tx.buildingStockItem.update({
    where: { buildingId_productId: { buildingId, productId } },
    data: {
      quantity: { increment: amount },
      updatedAt: new Date(),
    },
  });

  if (meta) {
    await recordStockMovement(tx, {
      scope: 'DEPOT',
      movementType: 'DEPOT_SHIP_OUT',
      productId,
      warehouseId,
      buildingId,
      quantityBefore: depotQtyBefore,
      quantityDelta: -amount,
      quantityAfter: depotQtyBefore - amount,
      reservedBefore,
      reservedDelta: -amount,
      reservedAfter: reservedBefore - amount,
      performedById: meta.performedById,
      shipmentOrderId: meta.shipmentOrderId,
      shipmentDestinationId: meta.shipmentDestinationId,
      shipmentLineId: meta.shipmentLineId,
      note: meta.note,
    });

    await recordStockMovement(tx, {
      scope: 'BUILDING',
      movementType: 'BUILDING_RECEIVE',
      productId,
      warehouseId,
      buildingId,
      quantityBefore: buildingQtyBefore,
      quantityDelta: amount,
      quantityAfter: buildingQtyBefore + amount,
      performedById: meta.performedById,
      shipmentOrderId: meta.shipmentOrderId,
      shipmentDestinationId: meta.shipmentDestinationId,
      shipmentLineId: meta.shipmentLineId,
      note: meta.note,
    });
  }

  return buildingUpdated;
}

export function computeOrderStatus(
  destinations: Array<{ status: string }>,
): StockShipmentOrderStatus {
  if (destinations.length === 0) return 'DRAFT';

  const allCancelled = destinations.every((d) => d.status === 'CANCELLED');
  if (allCancelled) return 'CANCELLED';

  const allDeliveredOrCancelled = destinations.every(
    (d) => d.status === 'DELIVERED' || d.status === 'CANCELLED',
  );
  const anyDelivered = destinations.some((d) => d.status === 'DELIVERED');
  if (allDeliveredOrCancelled && anyDelivered) return 'DELIVERED';

  const anyPending = destinations.some((d) => d.status === 'PENDING');
  if (anyPending) return 'DISPATCHED';

  return 'DISPATCHED';
}

export async function generateShipmentReference(prisma: PrismaService) {
  const year = new Date().getFullYear();
  const prefix = `ENV-${year}-`;
  const last = await prisma.stockShipmentOrder.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });

  const lastSeq = last ? Number.parseInt(last.reference.slice(prefix.length), 10) : 0;
  const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
