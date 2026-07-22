import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BuildingMode, Prisma, QuoteStatus } from '@prisma/client';
import { QUOTE_STATUS_LABELS, QUOTE_VAT_RATE } from '@steam-genie/shared-constants';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { QueryQuotesDto } from './dto/query-quotes.dto';
import { ConvertQuoteDto, ParticularClientAction } from './dto/convert-quote.dto';
import { QuoteItemDto } from './dto/quote-item.dto';
import { QuotePdfService } from './quote-pdf.service';

const QUOTE_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' as const } },
  particularClient: {
    select: {
      id: true,
      name: true,
      taxId: true,
      address: true,
      contactName: true,
      email: true,
      phone: true,
      buildingId: true,
    },
  },
  building: {
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      province: true,
    },
  },
  eventualClient: {
    select: {
      id: true,
      name: true,
      address: true,
    },
  },
  workOrder: {
    select: {
      id: true,
      title: true,
      status: true,
      scheduledDate: true,
    },
  },
  createdBy: {
    select: { id: true, fullName: true },
  },
} satisfies Prisma.QuoteInclude;

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly quotePdfService: QuotePdfService,
  ) {}

  async findAll(query: QueryQuotesDto) {
    const { page = 1, limit = 20, status, particularClientId, buildingId, month } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.QuoteWhereInput = { deletedAt: null };
    if (status) where.status = status;
    if (particularClientId) where.particularClientId = particularClientId;
    if (buildingId) where.buildingId = buildingId;

    if (month) {
      const [y, m] = month.split('-').map(Number);
      const from = new Date(Date.UTC(y, m - 1, 1));
      const to = new Date(Date.UTC(y, m, 1));
      where.requestDate = { gte: from, lt: to };
    }

    const [data, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        include: QUOTE_INCLUDE,
        orderBy: [{ requestDate: 'desc' }, { number: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.quote.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) || 1 };
  }

  async findOne(id: string) {
    return this.assertExists(id);
  }

  async create(dto: CreateQuoteDto, createdById: string) {
    await this.assertClientXor({
      particularClientId: dto.particularClientId,
      buildingId: dto.buildingId,
      eventualClientId: dto.eventualClientId,
      eventualClient: dto.eventualClient,
    });

    const creator = await this.prisma.user.findFirst({
      where: { id: createdById, deletedAt: null },
      select: { fullName: true },
    });
    const sellerName =
      emptyToNull(dto.sellerName) ?? emptyToNull(creator?.fullName) ?? null;

    let contactPhone = emptyToNull(dto.contactPhone);
    let contactEmail = emptyToNull(dto.contactEmail);
    if (dto.particularClientId && (!contactPhone || !contactEmail)) {
      const client = await this.prisma.particularClient.findFirst({
        where: { id: dto.particularClientId, deletedAt: null },
        select: { phone: true, email: true },
      });
      contactPhone = contactPhone ?? emptyToNull(client?.phone);
      contactEmail = contactEmail ?? emptyToNull(client?.email);
    }

    const computed = this.computeTotals(dto.items);
    const requestDate = parseDateOnly(dto.requestDate);
    const validUntil = dto.validUntil
      ? parseDateOnly(dto.validUntil)
      : addMonths(requestDate, 1);

    return this.prisma.$transaction(async (tx) => {
      let eventualClientId = dto.eventualClientId ?? null;
      if (dto.eventualClient) {
        const created = await tx.eventualClient.create({
          data: {
            name: dto.eventualClient.name.trim(),
            address: emptyToNull(dto.eventualClient.address),
          },
          select: { id: true },
        });
        eventualClientId = created.id;
      }

      const number = await allocateQuoteNumber(tx);

      const quote = await tx.quote.create({
        data: {
          number,
          status: QuoteStatus.COTIZADO,
          particularClientId: dto.particularClientId ?? null,
          buildingId: dto.buildingId ?? null,
          eventualClientId,
          requestDate,
          serviceType: emptyToNull(dto.serviceType),
          clientDetails: emptyToNull(dto.clientDetails),
          contactPhone,
          contactEmail,
          sellerName,
          paymentCondition: emptyToNull(dto.paymentCondition) ?? 'Contado',
          paymentTerms:
            emptyToNull(dto.paymentTerms) ??
            '50% DE ANTICIPO EL RESTO A FINALIZAR EL SERVICIO',
          observations:
            emptyToNull(dto.observations) ?? 'ESTE PRESUPUESTO ES VALIDO POR UN MES',
          validUntil,
          ...computed,
          createdById,
          items: {
            create: dto.items.map((item, index) => ({
              quantity: item.quantity,
              description: item.description.trim(),
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent ?? null,
              lineTotal: lineTotal(item),
              sortOrder: index,
            })),
          },
        },
        include: QUOTE_INCLUDE,
      });

      if (dto.particularClientId && (contactPhone || contactEmail)) {
        await tx.particularClient.update({
          where: { id: dto.particularClientId },
          data: {
            ...(contactPhone ? { phone: contactPhone } : {}),
            ...(contactEmail ? { email: contactEmail } : {}),
          },
        });
      }

      return quote;
    });
  }

  async update(id: string, dto: UpdateQuoteDto) {
    const existing = await this.assertExists(id);

    if (existing.workOrderId && dto.items) {
      throw new BadRequestException(
        'No se pueden editar los ítems de un presupuesto ya convertido a servicio.',
      );
    }

    const nextParticular =
      dto.particularClientId !== undefined
        ? dto.particularClientId
        : existing.particularClientId;
    const nextBuilding =
      dto.buildingId !== undefined ? dto.buildingId : existing.buildingId;
    const nextEventual =
      dto.eventualClientId !== undefined
        ? dto.eventualClientId
        : existing.eventualClientId;

    if (
      dto.particularClientId !== undefined ||
      dto.buildingId !== undefined ||
      dto.eventualClientId !== undefined
    ) {
      await this.assertClientXor({
        particularClientId: nextParticular,
        buildingId: nextBuilding,
        eventualClientId: nextEventual,
      });
    }

    const computed = dto.items ? this.computeTotals(dto.items) : null;

    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.quoteItem.deleteMany({ where: { quoteId: id } });
      }

      const updated = await tx.quote.update({
        where: { id },
        data: {
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.particularClientId !== undefined
            ? { particularClientId: dto.particularClientId }
            : {}),
          ...(dto.buildingId !== undefined ? { buildingId: dto.buildingId } : {}),
          ...(dto.eventualClientId !== undefined
            ? { eventualClientId: dto.eventualClientId }
            : {}),
          ...(dto.requestDate !== undefined
            ? { requestDate: parseDateOnly(dto.requestDate) }
            : {}),
          ...(dto.serviceType !== undefined
            ? { serviceType: emptyToNull(dto.serviceType) }
            : {}),
          ...(dto.clientDetails !== undefined
            ? { clientDetails: emptyToNull(dto.clientDetails) }
            : {}),
          ...(dto.contactPhone !== undefined
            ? { contactPhone: emptyToNull(dto.contactPhone) }
            : {}),
          ...(dto.contactEmail !== undefined
            ? { contactEmail: emptyToNull(dto.contactEmail) }
            : {}),
          ...(dto.sellerName !== undefined
            ? { sellerName: emptyToNull(dto.sellerName) }
            : {}),
          ...(dto.paymentCondition !== undefined
            ? { paymentCondition: emptyToNull(dto.paymentCondition) }
            : {}),
          ...(dto.paymentTerms !== undefined
            ? { paymentTerms: emptyToNull(dto.paymentTerms) }
            : {}),
          ...(dto.observations !== undefined
            ? { observations: emptyToNull(dto.observations) }
            : {}),
          ...(dto.validUntil !== undefined
            ? {
                validUntil: dto.validUntil ? parseDateOnly(dto.validUntil) : null,
              }
            : {}),
          ...(computed ?? {}),
          ...(dto.items
            ? {
                items: {
                  create: dto.items.map((item, index) => ({
                    quantity: item.quantity,
                    description: item.description.trim(),
                    unitPrice: item.unitPrice,
                    discountPercent: item.discountPercent ?? null,
                    lineTotal: lineTotal(item),
                    sortOrder: index,
                  })),
                },
              }
            : {}),
        },
        include: QUOTE_INCLUDE,
      });

      const particularId = updated.particularClientId;
      if (
        particularId &&
        (dto.contactPhone !== undefined || dto.contactEmail !== undefined)
      ) {
        await tx.particularClient.update({
          where: { id: particularId },
          data: {
            ...(dto.contactPhone !== undefined
              ? { phone: emptyToNull(dto.contactPhone) }
              : {}),
            ...(dto.contactEmail !== undefined
              ? { email: emptyToNull(dto.contactEmail) }
              : {}),
          },
        });
      }

      return updated;
    });
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.quote.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Presupuesto eliminado' };
  }

  async generatePdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const quote = await this.assertExists(id);
    const client = resolveClientInfo(quote);
    const buffer = await this.quotePdfService.buildPdf({
      number: quote.number,
      requestDate: formatDate(quote.requestDate),
      statusLabel: QUOTE_STATUS_LABELS[quote.status as keyof typeof QUOTE_STATUS_LABELS],
      clientName: client.name,
      clientTaxId: client.taxId,
      clientAddress: client.address,
      clientContact: client.contactName,
      clientEmail: quote.contactEmail ?? client.email,
      clientPhone: quote.contactPhone ?? client.phone,
      sellerName: quote.sellerName,
      paymentCondition: quote.paymentCondition,
      paymentTerms: quote.paymentTerms,
      observations: quote.observations,
      validUntil: quote.validUntil ? formatDate(quote.validUntil) : null,
      serviceType: quote.serviceType,
      subtotal: toNumber(quote.subtotal),
      discountPercent: quote.discountPercent != null ? toNumber(quote.discountPercent) : null,
      vatRate: toNumber(quote.vatRate),
      vatAmount: toNumber(quote.vatAmount),
      total: toNumber(quote.total),
      items: quote.items.map((item) => ({
        quantity: toNumber(item.quantity),
        description: item.description,
        unitPrice: toNumber(item.unitPrice),
        discountPercent:
          item.discountPercent != null ? toNumber(item.discountPercent) : null,
        lineTotal: toNumber(item.lineTotal),
      })),
    });

    return {
      buffer,
      filename: `presupuesto-${String(quote.number).padStart(8, '0')}.pdf`,
    };
  }

  async findParticularClientMatches(id: string) {
    const quote = await this.assertExists(id);
    if (!quote.eventualClient) {
      return { eventualClient: null, matches: [] as const };
    }

    const address = quote.eventualClient.address?.trim() || null;
    const matches = address
      ? await this.findParticularClientsByAddress(address)
      : [];

    return {
      eventualClient: {
        id: quote.eventualClient.id,
        name: quote.eventualClient.name,
        address: quote.eventualClient.address,
      },
      matches,
    };
  }

  async convertToWorkOrder(id: string, dto: ConvertQuoteDto, createdById: string) {
    const quote = await this.assertExists(id);

    if (quote.status !== QuoteStatus.ACEPTADO) {
      throw new BadRequestException('Solo se pueden convertir presupuestos Aceptados.');
    }
    if (quote.workOrderId) {
      throw new ConflictException('Este presupuesto ya tiene un servicio eventual asociado.');
    }

    // ── Cliente eventual → particular + servicio QUOTE_ACCEPTED ──────────────
    if (quote.eventualClient) {
      return this.convertEventualQuoteToWorkOrder(quote, dto, createdById);
    }

    const siteBuildingId =
      quote.particularClient?.buildingId ?? quote.buildingId ?? null;
    if (!siteBuildingId) {
      throw new BadRequestException('El presupuesto no tiene un sitio/edificio asociado.');
    }

    const hierarchy = await this.resolveDefaultLocation(
      siteBuildingId,
      dto.floorId,
      dto.zoneId,
    );

    const title =
      dto.title?.trim() ||
      quote.serviceType?.trim() ||
      `Presupuesto ${String(quote.number).padStart(8, '0')}`;

    const descriptionParts = [
      dto.description?.trim(),
      quote.clientDetails?.trim(),
      quote.items.map((i) => `${i.quantity} × ${i.description}`).join('\n'),
      `Origen: presupuesto ${String(quote.number).padStart(8, '0')}`,
    ].filter(Boolean);

    const result = await this.workOrdersService.createCheckoutCleaning(
      {
        buildingId: siteBuildingId,
        floorId: hierarchy.floorId,
        zoneId: hierarchy.zoneId,
        scheduledAt: dto.scheduledAt,
        title,
        description: descriptionParts.join('\n\n'),
      },
      createdById,
    );

    await this.prisma.workOrder.update({
      where: { id: result.workOrder.id },
      data: { clientAmountCharged: quote.total },
    });

    const updated = await this.prisma.quote.update({
      where: { id },
      data: {
        workOrderId: result.workOrder.id,
        status: QuoteStatus.ACEPTADO,
      },
      include: QUOTE_INCLUDE,
    });

    return {
      quote: updated,
      workOrder: result.workOrder,
      warning: result.warning,
    };
  }

  private async convertEventualQuoteToWorkOrder(
    quote: Awaited<ReturnType<QuotesService['assertExists']>>,
    dto: ConvertQuoteDto,
    createdById: string,
  ) {
    const eventual = quote.eventualClient!;
    const address = eventual.address?.trim() || null;
    const matches = address ? await this.findParticularClientsByAddress(address) : [];

    let siteBuildingId: string;

    if (matches.length > 0) {
      if (!dto.particularClientAction) {
        throw new BadRequestException(
          'Hay clientes particulares con la misma dirección. Elegí usar uno existente o crear uno nuevo.',
        );
      }

      if (dto.particularClientAction === ParticularClientAction.USE_EXISTING) {
        if (!dto.particularClientId) {
          throw new BadRequestException('Seleccioná el cliente particular a reutilizar.');
        }
        const chosen = matches.find((m) => m.id === dto.particularClientId);
        if (!chosen) {
          throw new BadRequestException(
            'El cliente seleccionado no coincide con la dirección del presupuesto.',
          );
        }
        siteBuildingId = chosen.buildingId;
      } else {
        siteBuildingId = (
          await this.createParticularFromEventual({
            name: eventual.name,
            address,
            phone: quote.contactPhone,
            email: quote.contactEmail,
          })
        ).buildingId;
      }
    } else {
      siteBuildingId = (
        await this.createParticularFromEventual({
          name: eventual.name,
          address,
          phone: quote.contactPhone,
          email: quote.contactEmail,
        })
      ).buildingId;
    }

    const hierarchy = await this.resolveDefaultLocation(
      siteBuildingId,
      dto.floorId,
      dto.zoneId,
    );

    const title =
      dto.title?.trim() ||
      quote.serviceType?.trim() ||
      `Presupuesto ${String(quote.number).padStart(8, '0')}`;

    const descriptionParts = [
      dto.description?.trim(),
      quote.clientDetails?.trim(),
      quote.items.map((i) => `${i.quantity} × ${i.description}`).join('\n'),
      `Origen: presupuesto ${String(quote.number).padStart(8, '0')}`,
      `Cliente eventual: ${eventual.name}${address ? ` · ${address}` : ''}`,
    ].filter(Boolean);

    const result = await this.workOrdersService.createQuoteAcceptedService(
      {
        buildingId: siteBuildingId,
        floorId: hierarchy.floorId,
        zoneId: hierarchy.zoneId,
        scheduledAt: dto.scheduledAt,
        title,
        description: descriptionParts.join('\n\n'),
        clientAmountCharged: toNumber(quote.total),
      },
      createdById,
    );

    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        workOrderId: result.workOrder.id,
        status: QuoteStatus.ACEPTADO,
      },
      include: QUOTE_INCLUDE,
    });

    return {
      quote: updated,
      workOrder: result.workOrder,
      warning:
        'Servicio en estado Presupuesto aceptado. Al asignar el limpiador deberás definir el checklist de tareas.',
    };
  }

  private async findParticularClientsByAddress(address: string) {
    const normalized = normalizeAddress(address);
    if (!normalized) return [];

    const candidates = await this.prisma.particularClient.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        address: { not: null },
      },
      select: {
        id: true,
        name: true,
        address: true,
        buildingId: true,
        phone: true,
        email: true,
      },
      take: 200,
    });

    return candidates.filter(
      (c) => normalizeAddress(c.address ?? '') === normalized,
    );
  }

  private async createParticularFromEventual(input: {
    name: string;
    address: string | null;
    phone?: string | null;
    email?: string | null;
  }) {
    const { randomUUID } = await import('crypto');
    const name = input.name.trim();
    const address = emptyToNull(input.address);

    return this.prisma.$transaction(async (tx) => {
      const building = await tx.building.create({
        data: {
          name,
          address,
          requireGpsValidation: false,
          buildingMode: BuildingMode.SIMPLE,
          isActive: true,
        },
      });

      const floor = await tx.floor.create({
        data: {
          name: 'Planta baja',
          sortOrder: 0,
          buildingId: building.id,
        },
      });

      await tx.zone.create({
        data: {
          name: 'Principal',
          floorId: floor.id,
          buildingId: building.id,
          qrToken: randomUUID(),
        },
      });

      const client = await tx.particularClient.create({
        data: {
          name,
          address,
          phone: emptyToNull(input.phone),
          email: emptyToNull(input.email),
          isActive: true,
          buildingId: building.id,
        },
        select: { id: true, buildingId: true },
      });

      return client;
    });
  }

  private async resolveDefaultLocation(
    buildingId: string,
    floorId?: string,
    zoneId?: string,
  ) {
    if (floorId && zoneId) {
      return { floorId, zoneId };
    }

    const floor = await this.prisma.floor.findFirst({
      where: {
        buildingId,
        deletedAt: null,
        ...(floorId ? { id: floorId } : {}),
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        zones: {
          where: { deletedAt: null, ...(zoneId ? { id: zoneId } : {}) },
          orderBy: { name: 'asc' },
          take: 1,
        },
      },
    });

    const zone = floor?.zones[0];
    if (!floor || !zone) {
      throw new BadRequestException(
        'El sitio no tiene planta/zona. Configuralas antes de crear el servicio.',
      );
    }
    return { floorId: floor.id, zoneId: zone.id };
  }

  private async assertClientXor(input: {
    particularClientId?: string | null;
    buildingId?: string | null;
    eventualClientId?: string | null;
    eventualClient?: { name?: string } | null;
  }) {
    const hasParticular = Boolean(input.particularClientId);
    const hasBuilding = Boolean(input.buildingId);
    const hasEventual =
      Boolean(input.eventualClientId) || Boolean(input.eventualClient?.name?.trim());
    const selected = [hasParticular, hasBuilding, hasEventual].filter(Boolean).length;

    if (selected !== 1) {
      throw new BadRequestException(
        'El presupuesto debe asociarse a un cliente particular, un edificio o un cliente eventual (uno solo).',
      );
    }

    if (input.particularClientId) {
      const client = await this.prisma.particularClient.findFirst({
        where: { id: input.particularClientId, deletedAt: null },
        select: { id: true },
      });
      if (!client) throw new BadRequestException('Cliente particular no encontrado.');
    }

    if (input.buildingId) {
      const building = await this.prisma.building.findFirst({
        where: {
          id: input.buildingId,
          deletedAt: null,
          particularClient: null,
        },
        select: { id: true },
      });
      if (!building) {
        throw new BadRequestException(
          'Edificio no encontrado (o es un sitio de cliente particular; usá el cliente).',
        );
      }
    }

    if (input.eventualClientId) {
      const client = await this.prisma.eventualClient.findFirst({
        where: { id: input.eventualClientId, deletedAt: null },
        select: { id: true },
      });
      if (!client) throw new BadRequestException('Cliente eventual no encontrado.');
    }

    if (input.eventualClient && !emptyToNull(input.eventualClient.name)) {
      throw new BadRequestException('El cliente eventual requiere un nombre.');
    }
  }

  private computeTotals(items: QuoteItemDto[]) {
    const subtotal = round2(items.reduce((acc, item) => acc + lineTotal(item), 0));
    const vatRate = QUOTE_VAT_RATE;
    const vatAmount = round2(subtotal * (vatRate / 100));
    const total = round2(subtotal + vatAmount);
    return {
      subtotal,
      vatRate,
      vatAmount,
      total,
      discountPercent: null as number | null,
    };
  }

  private async assertExists(id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, deletedAt: null },
      include: QUOTE_INCLUDE,
    });
    if (!quote) throw new NotFoundException('Presupuesto no encontrado');
    return quote;
  }
}

/** Numeración segura: SELECT FOR UPDATE vía update atómico. */
async function allocateQuoteNumber(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ nextNumber: number | string }>>`
    UPDATE "quote_counters"
    SET "nextNumber" = "nextNumber" + 1
    WHERE "id" = 'default'
    RETURNING ("nextNumber" - 1) AS "nextNumber"
  `;
  if (!rows[0]) {
    await tx.quoteCounter.create({ data: { id: 'default', nextNumber: 2 } });
    return 1;
  }
  return Number(rows[0].nextNumber);
}

// Fix QuotesService to use allocateQuoteNumber instead of broken nextQuoteNumber
// I'll patch the service after write

function lineTotal(item: QuoteItemDto): number {
  const raw = item.quantity * item.unitPrice;
  const disc = item.discountPercent != null ? raw * (item.discountPercent / 100) : 0;
  return round2(raw - disc);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyToNull(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDateOnly(value: string): Date {
  const d = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Fecha inválida');
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function normalizeAddress(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10).split('-').reverse().join('/');
}

function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : Number(value);
}

function resolveClientInfo(quote: {
  particularClient: {
    name: string;
    taxId: string | null;
    address: string | null;
    contactName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  building: {
    name: string;
    address: string | null;
    city: string | null;
    province: string | null;
  } | null;
  eventualClient: {
    name: string;
    address: string | null;
  } | null;
}) {
  if (quote.particularClient) {
    return {
      name: quote.particularClient.name,
      taxId: quote.particularClient.taxId,
      address: quote.particularClient.address,
      contactName: quote.particularClient.contactName,
      email: quote.particularClient.email,
      phone: quote.particularClient.phone,
    };
  }
  if (quote.eventualClient) {
    return {
      name: quote.eventualClient.name,
      taxId: null,
      address: quote.eventualClient.address,
      contactName: null,
      email: null,
      phone: null,
    };
  }
  const b = quote.building!;
  const address = [b.address, b.city, b.province].filter(Boolean).join(' · ') || null;
  return {
    name: b.name,
    taxId: null,
    address,
    contactName: null,
    email: null,
    phone: null,
  };
}
