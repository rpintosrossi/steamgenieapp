import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BuildingMode, Prisma, QuoteStatus } from '@prisma/client';
import {
  QUOTE_STATUS_LABELS,
  QUOTE_VAT_RATE,
  QUOTE_DEFAULT_SERVICE_INCLUDES,
  buildQuotePdfFilename,
  calendarDateKeyInBusinessTz,
} from '@steam-genie/shared-constants';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { QueryQuotesDto } from './dto/query-quotes.dto';
import { ConvertQuoteDto, EventualSiteKind, ParticularClientAction } from './dto/convert-quote.dto';
import { QuoteItemDto } from './dto/quote-item.dto';
import { QuotePaymentInputDto } from './dto/payment-method.dto';
import { QuotePdfService } from './quote-pdf.service';
import { resolveQuoteBranch } from './quote-branches.service';

const QUOTE_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' as const } },
  payments: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      paymentMethod: { select: { id: true, name: true, isActive: true } },
    },
  },
  branch: {
    select: {
      id: true,
      name: true,
      address: true,
      phone: true,
      isDefault: true,
      isActive: true,
    },
  },
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
      taxId: true,
      address: true,
      city: true,
      province: true,
    },
  },
  eventualClient: {
    select: {
      id: true,
      name: true,
      taxId: true,
      address: true,
    },
  },
  workOrders: {
    where: { deletedAt: null },
    orderBy: { scheduledDate: 'asc' as const },
    select: {
      id: true,
      title: true,
      status: true,
      scheduledDate: true,
      scheduledTime: true,
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
    const {
      page = 1,
      limit = 20,
      status,
      particularClientId,
      buildingId,
      month,
      search,
      branchId,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.QuoteWhereInput = { deletedAt: null };
    if (status) where.status = status;
    if (particularClientId) where.particularClientId = particularClientId;
    if (buildingId) where.buildingId = buildingId;
    if (branchId) where.branchId = branchId;

    if (month) {
      const [y, m] = month.split('-').map(Number);
      const from = new Date(Date.UTC(y, m - 1, 1));
      const to = new Date(Date.UTC(y, m, 1));
      where.requestDate = { gte: from, lt: to };
    }

    const q = search?.trim();
    if (q) {
      const or: Prisma.QuoteWhereInput[] = [
        { particularClient: { name: { contains: q, mode: 'insensitive' } } },
        { building: { name: { contains: q, mode: 'insensitive' } } },
        { eventualClient: { name: { contains: q, mode: 'insensitive' } } },
      ];
      if (/^\d+$/.test(q)) {
        const asNumber = Number(q.replace(/^0+/, '') || '0');
        if (Number.isFinite(asNumber) && asNumber >= 0) {
          or.push({ number: asNumber });
        }
      }
      where.OR = or;
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
    const paymentCreates = await this.buildPaymentCreates(dto.payments);

    return this.prisma.$transaction(async (tx) => {
      let eventualClientId = dto.eventualClientId ?? null;
      if (dto.eventualClient) {
        const created = await tx.eventualClient.create({
          data: {
            name: dto.eventualClient.name.trim(),
            taxId: emptyToNull(dto.eventualClient.taxId),
            address: emptyToNull(dto.eventualClient.address),
          },
          select: { id: true },
        });
        eventualClientId = created.id;
      }

      const number = await allocateQuoteNumber(tx);
      const branch = await resolveQuoteBranch(tx, dto.branchId);

      const quote = await tx.quote.create({
        data: {
          number,
          status: QuoteStatus.COTIZADO,
          branchId: branch.id,
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
          internalNotes: emptyToNull(dto.internalNotes),
          serviceIncludes:
            emptyToNull(dto.serviceIncludes) ?? QUOTE_DEFAULT_SERVICE_INCLUDES,
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
          ...(paymentCreates.length
            ? { payments: { create: paymentCreates } }
            : {}),
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

    const switchingClient =
      dto.particularClientId !== undefined ||
      dto.buildingId !== undefined ||
      dto.eventualClientId !== undefined ||
      dto.eventualClient !== undefined;

    let nextParticular =
      dto.particularClientId !== undefined
        ? dto.particularClientId
        : existing.particularClientId;
    let nextBuilding =
      dto.buildingId !== undefined ? dto.buildingId : existing.buildingId;
    let nextEventual =
      dto.eventualClientId !== undefined
        ? dto.eventualClientId
        : existing.eventualClientId;

    // Si se envía cliente eventual inline, limpia los otros tipos.
    if (dto.eventualClient) {
      nextParticular = null;
      nextBuilding = null;
      nextEventual = nextEventual ?? existing.eventualClientId;
    } else if (dto.particularClientId) {
      nextBuilding = null;
      nextEventual = null;
    } else if (dto.buildingId) {
      nextParticular = null;
      nextEventual = null;
    }

    if (switchingClient) {
      await this.assertClientXor({
        particularClientId: nextParticular,
        buildingId: nextBuilding,
        eventualClientId: nextEventual,
        eventualClient: dto.eventualClient,
      });
    }

    const computed = dto.items ? this.computeTotals(dto.items) : null;
    const paymentCreates =
      dto.payments !== undefined ? await this.buildPaymentCreates(dto.payments) : null;

    return this.prisma.$transaction(async (tx) => {
      let eventualClientId = nextEventual;

      if (dto.eventualClient) {
        const eventualData = {
          name: dto.eventualClient.name.trim(),
          taxId: emptyToNull(dto.eventualClient.taxId),
          address: emptyToNull(dto.eventualClient.address),
        };
        if (existing.eventualClientId) {
          await tx.eventualClient.update({
            where: { id: existing.eventualClientId },
            data: eventualData,
          });
          eventualClientId = existing.eventualClientId;
        } else {
          const created = await tx.eventualClient.create({ data: eventualData });
          eventualClientId = created.id;
        }
      }

      if (dto.items) {
        await tx.quoteItem.deleteMany({ where: { quoteId: id } });
      }
      if (paymentCreates) {
        await tx.quotePayment.deleteMany({ where: { quoteId: id } });
      }

      let nextBranchId: string | undefined;
      if (dto.branchId) {
        if (dto.branchId === existing.branchId) {
          nextBranchId = existing.branchId;
        } else {
          const branch = await resolveQuoteBranch(tx, dto.branchId);
          nextBranchId = branch.id;
        }
      }

      const updated = await tx.quote.update({
        where: { id },
        data: {
          ...(nextBranchId ? { branchId: nextBranchId } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(switchingClient
            ? {
                particularClientId: nextParticular,
                buildingId: nextBuilding,
                eventualClientId,
              }
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
          ...(dto.internalNotes !== undefined
            ? { internalNotes: emptyToNull(dto.internalNotes) }
            : {}),
          ...(dto.serviceIncludes !== undefined
            ? { serviceIncludes: emptyToNull(dto.serviceIncludes) }
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
          ...(paymentCreates
            ? {
                payments: {
                  create: paymentCreates,
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

      // Si cambian los ítems y ya hay servicios, actualizar el monto cobrado vinculado.
      if (computed && existing.workOrders.length > 0) {
        const linked = await tx.workOrder.findMany({
          where: { quoteId: id, deletedAt: null },
          orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, clientAmountCharged: true },
        });
        const target =
          linked.find((wo) => wo.clientAmountCharged != null) ?? linked[0];
        if (target) {
          await tx.workOrder.update({
            where: { id: target.id },
            data: { clientAmountCharged: computed.total },
          });
        }
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
      companyBranchName: quote.branch?.name ?? null,
      companyAddress: quote.branch?.address ?? null,
      companyPhone: quote.branch?.phone ?? null,
      paymentCondition: quote.paymentCondition,
      paymentTerms: quote.paymentTerms,
      observations: quote.observations,
      serviceIncludes: quote.serviceIncludes,
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
      filename: buildQuotePdfFilename(client.name, quote.number),
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
        taxId: quote.eventualClient.taxId,
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
    if (quote.workOrders.length > 0) {
      throw new ConflictException('Este presupuesto ya tiene servicios eventuales asociados.');
    }

    const scheduledAts = this.normalizeScheduledAts(dto.scheduledAts);

    // ── Cliente eventual → particular + servicio QUOTE_ACCEPTED ──────────────
    if (quote.eventualClient) {
      return this.convertEventualQuoteToWorkOrder(quote, dto, createdById, scheduledAts);
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

    const baseTitle =
      dto.title?.trim() ||
      quote.serviceType?.trim() ||
      `Presupuesto ${String(quote.number).padStart(8, '0')}`;

    const descriptionParts = [
      dto.description?.trim(),
      quote.clientDetails?.trim(),
      quote.items.map((i) => `${i.quantity} × ${i.description}`).join('\n'),
      `Origen: presupuesto ${String(quote.number).padStart(8, '0')}`,
      scheduledAts.length > 1
        ? `Servicio multi-día (${scheduledAts.length} visitas). Monto del presupuesto cargado en la primera visita.`
        : null,
    ].filter(Boolean);

    const description = descriptionParts.join('\n\n');
    const workOrders = [];
    let warning: string | undefined;

    for (let i = 0; i < scheduledAts.length; i++) {
      const scheduledAt = scheduledAts[i];
      const title = truncateTitle(
        scheduledAts.length > 1
          ? `${baseTitle} · ${formatVisitLabel(scheduledAt)}`
          : baseTitle,
      );

      const result = await this.workOrdersService.createCheckoutCleaning(
        {
          buildingId: siteBuildingId,
          floorId: hierarchy.floorId,
          zoneId: hierarchy.zoneId,
          scheduledAt,
          title,
          description,
          quoteId: quote.id,
        },
        createdById,
      );

      if (i === 0) {
        await this.prisma.workOrder.update({
          where: { id: result.workOrder.id },
          data: { clientAmountCharged: quote.total },
        });
        warning = result.warning;
      }

      workOrders.push(result.workOrder);
    }

    const updated = await this.prisma.quote.findFirstOrThrow({
      where: { id },
      include: QUOTE_INCLUDE,
    });

    return {
      quote: updated,
      workOrders: workOrders.map(toConvertWorkOrderSummary),
      workOrder: toConvertWorkOrderSummary(workOrders[0]),
      warning:
        scheduledAts.length > 1
          ? [
              `Se crearon ${scheduledAts.length} servicios (uno por día).`,
              warning,
            ]
              .filter(Boolean)
              .join(' ')
          : warning,
    };
  }

  private async convertEventualQuoteToWorkOrder(
    quote: Awaited<ReturnType<QuotesService['assertExists']>>,
    dto: ConvertQuoteDto,
    createdById: string,
    scheduledAts: string[],
  ) {
    const eventual = quote.eventualClient!;
    const address = eventual.address?.trim() || null;

    if (!dto.eventualSiteKind) {
      throw new BadRequestException(
        'Indicá si el sitio operativo debe ser Cliente particular o Edificio.',
      );
    }

    let siteBuildingId: string;

    if (dto.eventualSiteKind === EventualSiteKind.BUILDING) {
      siteBuildingId = await this.createBuildingFromEventual({
        name: eventual.name,
        taxId: eventual.taxId,
        address,
      });
    } else {
      const matches = address ? await this.findParticularClientsByAddress(address) : [];

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
          if (quote.branchId && chosen.id) {
            await this.prisma.particularClient.update({
              where: { id: chosen.id },
              data: { branchId: quote.branchId },
            });
          }
        } else {
          siteBuildingId = (
            await this.createParticularFromEventual({
              name: eventual.name,
              taxId: eventual.taxId,
              address,
              phone: quote.contactPhone,
              email: quote.contactEmail,
              branchId: quote.branchId,
            })
          ).buildingId;
        }
      } else {
        siteBuildingId = (
          await this.createParticularFromEventual({
            name: eventual.name,
            taxId: eventual.taxId,
            address,
            phone: quote.contactPhone,
            email: quote.contactEmail,
            branchId: quote.branchId,
          })
        ).buildingId;
      }
    }

    const hierarchy = await this.resolveDefaultLocation(
      siteBuildingId,
      dto.floorId,
      dto.zoneId,
    );

    const baseTitle =
      dto.title?.trim() ||
      quote.serviceType?.trim() ||
      `Presupuesto ${String(quote.number).padStart(8, '0')}`;

    const descriptionParts = [
      dto.description?.trim(),
      quote.clientDetails?.trim(),
      quote.items.map((i) => `${i.quantity} × ${i.description}`).join('\n'),
      `Origen: presupuesto ${String(quote.number).padStart(8, '0')}`,
      `Cliente eventual: ${eventual.name}${address ? ` · ${address}` : ''}`,
      scheduledAts.length > 1
        ? `Servicio multi-día (${scheduledAts.length} visitas). Monto del presupuesto cargado en la primera visita.`
        : null,
    ].filter(Boolean);

    const description = descriptionParts.join('\n\n');
    const workOrders = [];

    for (let i = 0; i < scheduledAts.length; i++) {
      const scheduledAt = scheduledAts[i];
      const title = truncateTitle(
        scheduledAts.length > 1
          ? `${baseTitle} · ${formatVisitLabel(scheduledAt)}`
          : baseTitle,
      );

      const result = await this.workOrdersService.createQuoteAcceptedService(
        {
          buildingId: siteBuildingId,
          floorId: hierarchy.floorId,
          zoneId: hierarchy.zoneId,
          scheduledAt,
          title,
          description,
          clientAmountCharged: i === 0 ? toNumber(quote.total) : null,
          quoteId: quote.id,
        },
        createdById,
      );
      workOrders.push(result.workOrder);
    }

    const updated = await this.prisma.quote.findFirstOrThrow({
      where: { id: quote.id },
      include: QUOTE_INCLUDE,
    });

    return {
      quote: updated,
      workOrders: workOrders.map(toConvertWorkOrderSummary),
      workOrder: toConvertWorkOrderSummary(workOrders[0]),
      warning:
        scheduledAts.length > 1
          ? `Se crearon ${scheduledAts.length} servicios en estado Presupuesto aceptado (uno por día). Al asignar cada uno deberás definir el checklist de tareas.`
          : 'Servicio en estado Presupuesto aceptado. Al asignar el limpiador deberás definir el checklist de tareas.',
    };
  }

  /** Valida, ordena y deduplica por día de calendario (TZ negocio). */
  private normalizeScheduledAts(raw: string[]): string[] {
    if (!raw?.length) {
      throw new BadRequestException('Indicá al menos una fecha/hora de servicio.');
    }

    const parsed = raw.map((value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException(`Fecha/hora inválida: ${value}`);
      }
      return date;
    });

    parsed.sort((a, b) => a.getTime() - b.getTime());

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const date of parsed) {
      const key = calendarDateKeyInBusinessTz(date);
      if (seen.has(key)) {
        throw new BadRequestException(
          `Hay fechas duplicadas para el mismo día (${key}). Cada visita debe ser en un día distinto.`,
        );
      }
      seen.add(key);
      unique.push(date.toISOString());
    }

    return unique;
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

  private async createBuildingFromEventual(input: {
    name: string;
    taxId?: string | null;
    address: string | null;
  }) {
    const { randomUUID } = await import('crypto');
    const name = input.name.trim();
    const address = emptyToNull(input.address);
    const taxId = emptyToNull(input.taxId);

    return this.prisma.$transaction(async (tx) => {
      const building = await tx.building.create({
        data: {
          name,
          taxId,
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

      return building.id;
    });
  }

  private async createParticularFromEventual(input: {
    name: string;
    taxId?: string | null;
    address: string | null;
    phone?: string | null;
    email?: string | null;
    branchId: string;
  }) {
    const { randomUUID } = await import('crypto');
    const name = input.name.trim();
    const address = emptyToNull(input.address);
    const taxId = emptyToNull(input.taxId);

    return this.prisma.$transaction(async (tx) => {
      const building = await tx.building.create({
        data: {
          name,
          taxId,
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
          taxId,
          address,
          phone: emptyToNull(input.phone),
          email: emptyToNull(input.email),
          isActive: true,
          buildingId: building.id,
          branchId: input.branchId,
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

  private async buildPaymentCreates(payments?: QuotePaymentInputDto[]) {
    if (!payments?.length) return [];

    const methodIds = [...new Set(payments.map((p) => p.paymentMethodId))];
    const methods = await this.prisma.paymentMethod.findMany({
      where: { id: { in: methodIds }, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (methods.length !== methodIds.length) {
      throw new BadRequestException('Hay métodos de pago inválidos o inactivos.');
    }

    let percentSum = 0;
    const creates = payments.map((payment, index) => {
      if (payment.isPending) {
        return {
          paymentMethodId: payment.paymentMethodId,
          isPending: true,
          percent: null as number | null,
          note: emptyToNull(payment.note),
          sortOrder: index,
        };
      }
      const percent = Number(payment.percent);
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        throw new BadRequestException(
          'Cada pago abonado necesita un porcentaje entre 0.01 y 100.',
        );
      }
      percentSum += percent;
      return {
        paymentMethodId: payment.paymentMethodId,
        isPending: false,
        percent,
        note: emptyToNull(payment.note),
        sortOrder: index,
      };
    });

    if (percentSum > 100.001) {
      throw new BadRequestException(
        `La suma de porcentajes abonados no puede superar 100% (ahora ${round2(percentSum)}%).`,
      );
    }

    return creates;
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

/** Etiqueta corta dd/mm para títulos de visitas multi-día. */
function formatVisitLabel(iso: string): string {
  const key = calendarDateKeyInBusinessTz(new Date(iso));
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}

/** Payload liviano para evitar respuestas pesadas/corruptas en el cliente. */
function toConvertWorkOrderSummary(wo: {
  id: string;
  title: string;
  status: string;
  scheduledDate?: Date | string | null;
}) {
  return {
    id: wo.id,
    title: wo.title,
    status: wo.status,
    scheduledDate: wo.scheduledDate ?? null,
  };
}

function truncateTitle(title: string, max = 300): string {
  const trimmed = title.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
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
    taxId: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
  } | null;
  eventualClient: {
    name: string;
    taxId: string | null;
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
      taxId: quote.eventualClient.taxId,
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
    taxId: b.taxId,
    address,
    contactName: null,
    email: null,
    phone: null,
  };
}
