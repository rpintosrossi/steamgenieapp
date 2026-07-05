import { Prisma, StockMovementScope, StockMovementType } from '@prisma/client';

type PrismaExecutor = Prisma.TransactionClient;

export type RecordStockMovementInput = {
  scope: StockMovementScope;
  movementType: StockMovementType;
  productId: string;
  buildingId?: string | null;
  quantityBefore: number;
  quantityDelta: number;
  quantityAfter: number;
  reservedBefore?: number | null;
  reservedDelta?: number | null;
  reservedAfter?: number | null;
  shipmentOrderId?: string | null;
  shipmentDestinationId?: string | null;
  shipmentLineId?: string | null;
  note?: string | null;
  performedById?: string | null;
};

export async function recordStockMovement(
  tx: PrismaExecutor,
  input: RecordStockMovementInput,
) {
  return tx.stockMovement.create({
    data: {
      scope: input.scope,
      movementType: input.movementType,
      productId: input.productId,
      buildingId: input.buildingId ?? null,
      quantityBefore: input.quantityBefore,
      quantityDelta: input.quantityDelta,
      quantityAfter: input.quantityAfter,
      reservedBefore: input.reservedBefore ?? null,
      reservedDelta: input.reservedDelta ?? null,
      reservedAfter: input.reservedAfter ?? null,
      shipmentOrderId: input.shipmentOrderId ?? null,
      shipmentDestinationId: input.shipmentDestinationId ?? null,
      shipmentLineId: input.shipmentLineId ?? null,
      note: input.note?.trim() || null,
      performedById: input.performedById ?? null,
    },
  });
}
