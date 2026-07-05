import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '@steam-genie/shared-types';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  CreateShipmentOrderDto,
  DispatchShipmentOrderDto,
  UpdateShipmentOrderDto,
} from './dto/shipment-order.dto';
import {
  assertActiveProduct,
  aggregateLineQuantities,
  assertDepotAvailabilityForTotals,
  computeOrderStatus,
  ensureBuildingStockItem,
  generateShipmentReference,
  parseDeliveryDate,
  releaseDepotReservation,
  reserveDepotStock,
  toNumber,
  transferReservedToBuilding,
} from './stock-logistics.helpers';

const ORDER_SELECT = {
  id: true,
  reference: true,
  status: true,
  notes: true,
  createdById: true,
  dispatchedById: true,
  dispatchedAt: true,
  createdAt: true,
  updatedAt: true,
  destinations: {
    select: {
      id: true,
      buildingId: true,
      deliveryDate: true,
      status: true,
      deliveredAt: true,
      confirmedById: true,
      building: { select: { id: true, name: true } },
      lines: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          status: true,
          product: {
            select: { id: true, name: true, unitType: true, sku: true },
          },
        },
      },
    },
  },
} as const;

@Injectable()
export class StockShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const orders = await this.prisma.stockShipmentOrder.findMany({
      select: ORDER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((order) => this.mapOrder(order));
  }

  async findOne(id: string) {
    const order = await this.prisma.stockShipmentOrder.findUnique({
      where: { id },
      select: ORDER_SELECT,
    });
    if (!order) throw new NotFoundException('Orden de envío no encontrada');
    return this.mapOrder(order);
  }

  async create(user: AuthUser, dto: CreateShipmentOrderDto) {
    await this.validateDestinationsInput(dto.destinations);

    const reference = await generateShipmentReference(this.prisma);

    const order = await this.prisma.stockShipmentOrder.create({
      data: {
        reference,
        status: 'DRAFT',
        notes: dto.notes?.trim() || null,
        createdById: user.id,
        destinations: {
          create: dto.destinations.map((dest) => ({
            buildingId: dest.buildingId,
            lines: {
              create: dest.lines.map((line) => ({
                productId: line.productId,
                quantity: line.quantity,
              })),
            },
          })),
        },
      },
      select: ORDER_SELECT,
    });

    await this.ensureBuildingProductsFromOrder(order);
    return this.mapOrder(order);
  }

  async update(id: string, dto: UpdateShipmentOrderDto) {
    const order = await this.assertDraftOrder(id);

    if (dto.destinations) {
      await this.validateDestinationsInput(dto.destinations);
      await this.prisma.$transaction(async (tx) => {
        await tx.stockShipmentLine.deleteMany({
          where: { destination: { orderId: id } },
        });
        await tx.stockShipmentDestination.deleteMany({ where: { orderId: id } });

        for (const dest of dto.destinations!) {
          await tx.stockShipmentDestination.create({
            data: {
              orderId: id,
              buildingId: dest.buildingId,
              lines: {
                create: dest.lines.map((line) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                })),
              },
            },
          });
        }

        if (dto.notes !== undefined) {
          await tx.stockShipmentOrder.update({
            where: { id },
            data: { notes: dto.notes?.trim() || null },
          });
        }
      });
    } else if (dto.notes !== undefined) {
      await this.prisma.stockShipmentOrder.update({
        where: { id },
        data: { notes: dto.notes?.trim() || null },
      });
    }

    const updated = await this.findOne(id);
    await this.ensureBuildingProductsFromOrder(updated);
    return updated;
  }

  async dispatch(id: string, user: AuthUser, dto: DispatchShipmentOrderDto) {
    const order = await this.prisma.stockShipmentOrder.findUnique({
      where: { id },
      include: {
        destinations: { include: { lines: true } },
      },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden despachar órdenes en borrador.');
    }

    const dispatchMap = new Map(
      dto.destinations.map((d) => [d.destinationId, parseDeliveryDate(d.deliveryDate)]),
    );

    for (const dest of order.destinations) {
      if (!dispatchMap.has(dest.id)) {
        throw new BadRequestException(
          `Falta fecha de entrega para el edificio destino ${dest.buildingId}.`,
        );
      }
    }

    const depotTotals = aggregateLineQuantities(order.destinations);
    await assertDepotAvailabilityForTotals(this.prisma, depotTotals);

    await this.prisma.$transaction(async (tx) => {
      for (const dest of order.destinations) {
        const deliveryDate = dispatchMap.get(dest.id)!;

        for (const line of dest.lines) {
          const qty = toNumber(line.quantity);
          await assertActiveProduct(tx, line.productId);
          await reserveDepotStock(tx, line.productId, qty, {
            performedById: user.id,
            shipmentOrderId: order.id,
            shipmentDestinationId: dest.id,
            shipmentLineId: line.id,
            note: `Reserva al despachar ${order.reference}`,
          });
          await ensureBuildingStockItem(tx, dest.buildingId, line.productId);
        }

        await tx.stockShipmentDestination.update({
          where: { id: dest.id },
          data: { deliveryDate },
        });

        for (const line of dest.lines) {
          const openAlert = await tx.buildingStockAlert.findFirst({
            where: {
              buildingId: dest.buildingId,
              productId: line.productId,
              status: 'OPEN',
            },
          });
          if (openAlert) {
            await tx.buildingStockAlert.update({
              where: { id: openAlert.id },
              data: {
                status: 'IN_TRANSIT',
                shipmentDestinationId: dest.id,
                deliveryDate,
              },
            });
          }
        }
      }

      await tx.stockShipmentOrder.update({
        where: { id },
        data: {
          status: 'DISPATCHED',
          dispatchedAt: new Date(),
          dispatchedById: user.id,
        },
      });
    });

    return this.findOne(id);
  }

  async deliverDestination(destinationId: string, user: AuthUser) {
    const destination = await this.prisma.stockShipmentDestination.findUnique({
      where: { id: destinationId },
      include: {
        lines: true,
        order: true,
      },
    });
    if (!destination) throw new NotFoundException('Destino no encontrado');
    if (destination.status !== 'PENDING') {
      throw new BadRequestException('Este destino ya fue procesado.');
    }
    if (destination.order.status !== 'DISPATCHED') {
      throw new BadRequestException('La orden no está despachada.');
    }

    if (user.primaryRole === 'cleaner') {
      const attendance = await this.prisma.attendance.findFirst({
        where: {
          userId: user.id,
          buildingId: destination.buildingId,
          checkOutAt: null,
          deletedAt: null,
        },
      });
      if (!attendance) {
        throw new BadRequestException(
          'Debés estar fichado en el edificio para confirmar la entrega.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of destination.lines) {
        if (line.status !== 'PENDING') continue;
        const qty = toNumber(line.quantity);
        await transferReservedToBuilding(
          tx,
          destination.buildingId,
          line.productId,
          qty,
          {
            performedById: user.id,
            shipmentOrderId: destination.orderId,
            shipmentDestinationId: destination.id,
            shipmentLineId: line.id,
            note: `Recepción confirmada — ${destination.order.reference}`,
          },
        );
        await tx.stockShipmentLine.update({
          where: { id: line.id },
          data: { status: 'DELIVERED' },
        });
      }

      await tx.buildingStockAlert.updateMany({
        where: {
          shipmentDestinationId: destination.id,
          status: 'IN_TRANSIT',
        },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
        },
      });

      await tx.stockShipmentDestination.update({
        where: { id: destinationId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          confirmedById: user.id,
        },
      });

      const allDestinations = await tx.stockShipmentDestination.findMany({
        where: { orderId: destination.orderId },
        select: { status: true },
      });

      await tx.stockShipmentOrder.update({
        where: { id: destination.orderId },
        data: { status: computeOrderStatus(allDestinations) },
      });
    });

    return {
      ok: true as const,
      orderId: destination.orderId,
      destinationId,
    };
  }

  async cancelDestination(destinationId: string, user: AuthUser) {
    const destination = await this.prisma.stockShipmentDestination.findUnique({
      where: { id: destinationId },
      include: { lines: true, order: true },
    });
    if (!destination) throw new NotFoundException('Destino no encontrado');
    if (destination.status !== 'PENDING') {
      throw new BadRequestException('Este destino ya fue procesado.');
    }

    const isDispatched = destination.order.status === 'DISPATCHED';

    await this.prisma.$transaction(async (tx) => {
      for (const line of destination.lines) {
        if (line.status !== 'PENDING') continue;
        const qty = toNumber(line.quantity);
        if (isDispatched) {
          await releaseDepotReservation(tx, line.productId, qty, {
            performedById: user.id,
            shipmentOrderId: destination.orderId,
            shipmentDestinationId: destination.id,
            shipmentLineId: line.id,
            note: `Cancelación de envío — ${destination.order.reference}`,
          });
        }
        await tx.stockShipmentLine.update({
          where: { id: line.id },
          data: { status: 'CANCELLED' },
        });
      }

      await tx.buildingStockAlert.updateMany({
        where: {
          shipmentDestinationId: destination.id,
          status: 'IN_TRANSIT',
        },
        data: {
          status: 'OPEN',
          shipmentDestinationId: null,
          deliveryDate: null,
        },
      });

      await tx.stockShipmentDestination.update({
        where: { id: destinationId },
        data: { status: 'CANCELLED' },
      });

      const allDestinations = await tx.stockShipmentDestination.findMany({
        where: { orderId: destination.orderId },
        select: { status: true },
      });

      await tx.stockShipmentOrder.update({
        where: { id: destination.orderId },
        data: { status: computeOrderStatus(allDestinations) },
      });
    });

    return this.findOne(destination.orderId);
  }

  private async assertDraftOrder(id: string) {
    const order = await this.prisma.stockShipmentOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden editar órdenes en borrador.');
    }
    return order;
  }

  private async validateDestinationsInput(
    destinations: CreateShipmentOrderDto['destinations'],
  ) {
    if (!destinations.length) {
      throw new BadRequestException('Debe incluir al menos un edificio destino.');
    }

    const buildingIds = new Set<string>();
    const productTotals = new Map<string, number>();

    for (const dest of destinations) {
      if (buildingIds.has(dest.buildingId)) {
        throw new BadRequestException('Edificio duplicado en la orden.');
      }
      buildingIds.add(dest.buildingId);

      const building = await this.prisma.building.findFirst({
        where: { id: dest.buildingId, deletedAt: null, isActive: true },
      });
      if (!building) throw new NotFoundException('Edificio no encontrado');

      const productsInDest = new Set<string>();
      for (const line of dest.lines) {
        const product = await assertActiveProduct(this.prisma, line.productId);
        if (line.quantity <= 0) {
          throw new BadRequestException('Cantidad inválida en línea de envío.');
        }
        if (productsInDest.has(line.productId)) {
          throw new BadRequestException(
            `El producto «${product.name}» está repetido en el mismo edificio. Usá una sola línea por producto.`,
          );
        }
        productsInDest.add(line.productId);
        productTotals.set(
          line.productId,
          (productTotals.get(line.productId) ?? 0) + line.quantity,
        );
      }
    }

    await assertDepotAvailabilityForTotals(this.prisma, productTotals);
  }

  private async ensureBuildingProductsFromOrder(order: {
    destinations: Array<{
      buildingId: string;
      lines: Array<{ productId: string }>;
    }>;
  }) {
    for (const dest of order.destinations) {
      for (const line of dest.lines) {
        await this.prisma.buildingStockItem.upsert({
          where: {
            buildingId_productId: {
              buildingId: dest.buildingId,
              productId: line.productId,
            },
          },
          create: {
            buildingId: dest.buildingId,
            productId: line.productId,
            quantity: 0,
          },
          update: {},
        });
      }
    }
  }

  private mapOrder(order: {
    id: string;
    reference: string;
    status: string;
    notes: string | null;
    createdById: string;
    dispatchedById: string | null;
    dispatchedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    destinations: Array<{
      id: string;
      buildingId: string;
      deliveryDate: Date | null;
      status: string;
      deliveredAt: Date | null;
      confirmedById: string | null;
      building: { id: string; name: string };
      lines: Array<{
        id: string;
        productId: string;
        quantity: { toNumber(): number } | number;
        status: string;
        product: { id: string; name: string; unitType: string; sku: string | null };
      }>;
    }>;
  }) {
    return {
      ...order,
      destinations: order.destinations.map((dest) => ({
        ...dest,
        lines: dest.lines.map((line) => ({
          ...line,
          quantity: toNumber(line.quantity as never),
        })),
      })),
    };
  }
}
