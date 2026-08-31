import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { BuildingMode, Prisma, QuoteStatus, WorkOrderStatus } from '@prisma/client';
import {
  QUOTE_STATUS_LABELS,
  QUOTE_VAT_RATE,
  QUOTE_DEFAULT_SERVICE_INCLUDES,
  buildQuotePdfFilename,
  calendarDateKeyInBusinessTz,
} from '@steam-genie/shared-constants';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { QueryQuotesDto, QueryPaymentsDashboardDto } from './dto/query-quotes.dto';
import { ConvertQuoteDto, EventualSiteKind, ParticularClientAction } from './dto/convert-quote.dto';
import { QuoteItemDto } from './dto/quote-item.dto';
import { QuotePaymentInputDto } from './dto/payment-method.dto';
import { QuotePdfService } from './quote-pdf.service';
import { resolveQuoteBranch } from './quote-branches.service';
import * as crypto from 'crypto';
import * as path from 'path';
import type { Response } from 'express';
import type { AuthUser } from '@steam-genie/shared-types';
import {
  assertBuildingAccess,
  loadBuildingAccessScope,
  mergeBuildingIdConstraint,
} from '../../common/building-access';
import {
  isBranchAccessible,
  listAccessibleBranchIds,
  loadBranchAccessScope,
  mergeBranchIdConstraint,
} from '../../common/branch-access';

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
  internalPhotos: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      fileSizeBytes: true,
      createdAt: true,
      uploadedBy: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.QuoteInclude;

const PAYMENTS_DASHBOARD_INCLUDE = {
  payments: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      paymentMethod: { select: { id: true, name: true, isActive: true } },
    },
  },
  particularClient: { select: { id: true, name: true } },
  building: { select: { id: true, name: true } },
  eventualClient: { select: { id: true, name: true } },
  workOrders: {
    where: { deletedAt: null },
    orderBy: { scheduledDate: 'asc' as const },
    select: {
      id: true,
      title: true,
      status: true,
      scheduledDate: true,
    },
  },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.QuoteInclude;

type PaymentsDashboardServiceStatus = 'done' | 'partial' | 'pending' | 'none';
type PaymentsDashboardClientKind = 'particular' | 'building' | 'eventual';

type PaymentsDashboardMethodSlice = {
  paymentMethodId: string;
  name: string;
  amount: number;
};

type PaymentsDashboardPaidSlice = {
  paymentMethodId: string;
  name: string;
  percent: number;
  amount: number;
};

type PaymentsDashboardQuote = {
  id: string;
  number: number;
  status: QuoteStatus;
  requestDate: Date;
  total: number;
  paidPercent: number;
  paidAmount: number;
  pendingPercent: number;
  pendingAmount: number;
  serviceStatus: PaymentsDashboardServiceStatus;
  clientKind: PaymentsDashboardClientKind | null;
  clientId: string | null;
  clientName: string;
  branchName: string | null;
  pendingByMethod: PaymentsDashboardMethodSlice[];
  paidByMethod: PaymentsDashboardPaidSlice[];
  workOrders: Array<{
    id: string;
    title: string;
    status: WorkOrderStatus;
    scheduledDate: Date | null;
  }>;
};

type PaymentsDashboardMethodStat = {
  paymentMethodId: string | null;
  name: string;
  amount: number;
  quoteCount: number;
};

const ALLOWED_INTERNAL_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
const MAX_INTERNAL_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_INTERNAL_PHOTOS = 20;

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly quotePdfService: QuotePdfService,
    private readonly storage: StorageService,
  ) {}

  async findAll(query: QueryQuotesDto, user?: AuthUser) {
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

    if (user) {
      const [scope, branchIds] = await Promise.all([
        loadBuildingAccessScope(this.prisma, user.id),
        listAccessibleBranchIds(this.prisma, user.id),
      ]);
      if (!mergeBuildingIdConstraint(where, scope, { allowNull: true })) {
        return { data: [], total: 0, page, limit, pages: 0 };
      }
      if (!mergeBranchIdConstraint(where, branchIds, branchId)) {
        return { data: [], total: 0, page, limit, pages: 0 };
      }
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

    return {
      data: data.map((quote) => this.formatQuote(quote)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    };
  }

  async getPaymentsDashboard(query: QueryPaymentsDashboardDto, user?: AuthUser) {
    const { branchId, search } = query;
    const where: Prisma.QuoteWhereInput = {
      deletedAt: null,
      status: { not: QuoteStatus.RECHAZADO },
      AND: [
        {
          OR: [
            { particularClientId: null },
            { particularClient: { deletedAt: null } },
          ],
        },
        {
          OR: [
            { buildingId: null },
            { building: { deletedAt: null } },
          ],
        },
      ],
    };
    if (branchId) where.branchId = branchId;

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

    if (user) {
      const [scope, branchIds] = await Promise.all([
        loadBuildingAccessScope(this.prisma, user.id),
        listAccessibleBranchIds(this.prisma, user.id),
      ]);
      if (!mergeBuildingIdConstraint(where, scope, { allowNull: true })) {
        return emptyPaymentsDashboard();
      }
      if (!mergeBranchIdConstraint(where, branchIds, branchId)) {
        return emptyPaymentsDashboard();
      }
    }

    const quotes = await this.prisma.quote.findMany({
      where,
      include: PAYMENTS_DASHBOARD_INCLUDE,
      orderBy: [{ requestDate: 'desc' }, { number: 'desc' }],
    });

    const pendingQuotes: PaymentsDashboardQuote[] = [];
    for (const quote of quotes) {
      const row = toPaymentsDashboardQuote(quote);
      if (row.pendingAmount < 0.01) continue;
      if (quote.status === QuoteStatus.COTIZADO && quote.payments.length === 0) continue;
      pendingQuotes.push(row);
    }

    const methodMap = new Map<string, PaymentsDashboardMethodStat>();
    for (const quote of pendingQuotes) {
      for (const slice of quote.pendingByMethod) {
        const current = methodMap.get(slice.paymentMethodId) ?? {
          paymentMethodId: slice.paymentMethodId === 'unassigned' ? null : slice.paymentMethodId,
          name: slice.name,
          amount: 0,
          quoteCount: 0,
        };
        current.amount = round2(current.amount + slice.amount);
        current.quoteCount += 1;
        methodMap.set(slice.paymentMethodId, current);
      }
    }

    const pendingAmount = round2(
      pendingQuotes.reduce((acc, quote) => acc + quote.pendingAmount, 0),
    );
    const byPaymentMethod = [...methodMap.values()]
      .map((item) => ({
        ...item,
        amount: round2(item.amount),
        percent: pendingAmount > 0 ? round2((item.amount / pendingAmount) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const clients = groupPaymentsDashboardClients(pendingQuotes);
    const doneServicesAmount = round2(
      pendingQuotes
        .filter((quote) => quote.serviceStatus === 'done')
        .reduce((acc, quote) => acc + quote.pendingAmount, 0),
    );
    const pendingServicesAmount = round2(
      pendingQuotes
        .filter((quote) => quote.serviceStatus === 'pending' || quote.serviceStatus === 'partial')
        .reduce((acc, quote) => acc + quote.pendingAmount, 0),
    );
    const noServiceAmount = round2(
      pendingQuotes
        .filter((quote) => quote.serviceStatus === 'none')
        .reduce((acc, quote) => acc + quote.pendingAmount, 0),
    );

    return {
      totals: {
        pendingAmount,
        pendingClients: clients.length,
        pendingQuotes: pendingQuotes.length,
        doneServicesAmount,
        pendingServicesAmount,
        noServiceAmount,
      },
      byPaymentMethod,
      clients,
    };
  }

  async findOne(id: string, user?: AuthUser) {
    const quote = await this.assertExists(id);
    if (user) {
      if (quote.buildingId) {
        await assertBuildingAccess(this.prisma, user.id, quote.buildingId);
      }
      const branchScope = await loadBranchAccessScope(this.prisma, user.id);
      if (!isBranchAccessible(branchScope, quote.branchId)) {
        throw new ForbiddenException('No tenés acceso a esta sucursal.');
      }
    }
    return this.formatQuote(quote);
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

      return this.formatQuote(quote);
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

      return this.formatQuote(updated);
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
      quote: this.formatQuote(updated),
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
        branchId: quote.branchId,
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
            await this.prisma.building.update({
              where: { id: chosen.buildingId },
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
      quote: this.formatQuote(updated),
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
          branchId: input.branchId,
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
          branchId: input.branchId,
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

  async uploadInternalPhoto(quoteId: string, file: Express.Multer.File, uploadedById: string) {
    if (!file) {
      throw new BadRequestException('La imagen es obligatoria (campo: photo).');
    }
    if (!ALLOWED_INTERNAL_PHOTO_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido "${file.mimetype}". Usá JPEG, PNG, WebP o HEIC.`,
      );
    }
    if (file.size > MAX_INTERNAL_PHOTO_BYTES) {
      throw new BadRequestException(
        `La imagen es demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: 8 MB.`,
      );
    }

    await this.assertExists(quoteId);

    const count = await this.prisma.quoteInternalPhoto.count({
      where: { quoteId, deletedAt: null },
    });
    if (count >= MAX_INTERNAL_PHOTOS) {
      throw new BadRequestException(
        `Este presupuesto ya tiene ${MAX_INTERNAL_PHOTOS} fotos internas. Eliminá alguna para agregar otra.`,
      );
    }

    const key = buildQuoteInternalPhotoKey(quoteId, file.originalname, file.mimetype);
    await this.storage.upload(key, file.buffer, file.mimetype);

    const photo = await this.prisma.quoteInternalPhoto.create({
      data: {
        quoteId,
        storageKey: key,
        storageBucket: this.storage.storageBucketName,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        uploadedById,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });

    return this.formatInternalPhoto(quoteId, photo);
  }

  async listInternalPhotos(quoteId: string) {
    await this.assertExists(quoteId);
    const photos = await this.prisma.quoteInternalPhoto.findMany({
      where: { quoteId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
    return photos.map((photo) => this.formatInternalPhoto(quoteId, photo));
  }

  async deleteInternalPhoto(quoteId: string, photoId: string, deletedById: string) {
    await this.assertExists(quoteId);
    const photo = await this.prisma.quoteInternalPhoto.findFirst({
      where: { id: photoId, quoteId, deletedAt: null },
    });
    if (!photo) throw new NotFoundException('Foto no encontrada');

    await this.prisma.quoteInternalPhoto.update({
      where: { id: photo.id },
      data: { deletedAt: new Date(), deletedBy: deletedById },
    });

    try {
      await this.storage.delete(photo.storageKey);
    } catch {
      // Soft delete ya aplicado; el archivo puede limpiarse después.
    }

    return { ok: true as const, id: photo.id };
  }

  async serveInternalPhoto(quoteId: string, photoId: string, res: Response) {
    await this.assertExists(quoteId);
    const photo = await this.prisma.quoteInternalPhoto.findFirst({
      where: { id: photoId, quoteId, deletedAt: null },
      select: { storageKey: true, mimeType: true },
    });
    if (!photo) throw new NotFoundException('Foto no encontrada');

    const contentType = photo.mimeType ?? mimeFromStorageKey(photo.storageKey);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const stream = this.storage.getLocalStream(photo.storageKey);
    if (stream) {
      stream.pipe(res);
      return;
    }

    const buffer = await this.storage.readBuffer(photo.storageKey);
    if (!buffer) throw new NotFoundException('Archivo no encontrado');
    res.send(buffer);
  }

  private formatQuote<
    T extends {
      id: string;
      internalPhotos?: Array<{
        id: string;
        originalFilename: string | null;
        mimeType: string | null;
        fileSizeBytes: number | null;
        createdAt: Date;
        uploadedBy?: { id: string; fullName: string } | null;
      }>;
    },
  >(quote: T) {
    const { internalPhotos, ...rest } = quote;
    return {
      ...rest,
      internalPhotos: (internalPhotos ?? []).map((photo) =>
        this.formatInternalPhoto(quote.id, photo),
      ),
    };
  }

  private formatInternalPhoto(
    quoteId: string,
    photo: {
      id: string;
      originalFilename?: string | null;
      mimeType?: string | null;
      fileSizeBytes?: number | null;
      createdAt: Date;
      uploadedBy?: { id: string; fullName: string } | null;
    },
  ) {
    return {
      id: photo.id,
      url: `/quotes/${quoteId}/internal-photos/${photo.id}/file`,
      originalFilename: photo.originalFilename ?? null,
      mimeType: photo.mimeType ?? null,
      fileSizeBytes: photo.fileSizeBytes ?? null,
      createdAt: photo.createdAt,
      uploadedBy: photo.uploadedBy ?? null,
    };
  }
}

function buildQuoteInternalPhotoKey(
  quoteId: string,
  filename: string,
  mimeType: string,
): string {
  const extFromName = path.extname(filename).toLowerCase();
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
  };
  const ext = extFromName || mimeToExt[mimeType] || '.jpg';
  return `quote-internal-photos/${quoteId}/${crypto.randomUUID()}${ext}`;
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

function emptyPaymentsDashboard() {
  return {
    totals: {
      pendingAmount: 0,
      pendingClients: 0,
      pendingQuotes: 0,
      doneServicesAmount: 0,
      pendingServicesAmount: 0,
      noServiceAmount: 0,
    },
    byPaymentMethod: [] as Array<PaymentsDashboardMethodStat & { percent: number }>,
    clients: [] as ReturnType<typeof groupPaymentsDashboardClients>,
  };
}

function quoteServiceStatus(
  workOrders: Array<{ status: WorkOrderStatus }>,
): PaymentsDashboardServiceStatus {
  const active = workOrders.filter((wo) => wo.status !== WorkOrderStatus.REJECTED);
  if (active.length === 0) return 'none';
  const completed = active.filter((wo) => wo.status === WorkOrderStatus.COMPLETED).length;
  if (completed === active.length) return 'done';
  if (completed > 0) return 'partial';
  return 'pending';
}

function rollupServiceStatus(
  statuses: PaymentsDashboardServiceStatus[],
): PaymentsDashboardServiceStatus {
  const unique = new Set(statuses);
  if (unique.size === 1) return statuses[0] ?? 'none';
  if (unique.has('done') && unique.size > 1) return 'partial';
  if (unique.has('partial')) return 'partial';
  if (unique.has('pending')) return 'pending';
  return 'none';
}

function toPaymentsDashboardQuote(quote: {
  id: string;
  number: number;
  status: QuoteStatus;
  requestDate: Date;
  total: Prisma.Decimal | number;
  particularClient: { id: string; name: string } | null;
  building: { id: string; name: string } | null;
  eventualClient: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
  payments: Array<{
    isPending: boolean;
    percent: Prisma.Decimal | number | null;
    paymentMethodId: string;
    paymentMethod: { id: string; name: string } | null;
  }>;
  workOrders: Array<{
    id: string;
    title: string;
    status: WorkOrderStatus;
    scheduledDate: Date | null;
  }>;
}): PaymentsDashboardQuote {
  const total = round2(toNumber(quote.total));
  const paidPercent = round2(
    quote.payments
      .filter((payment) => !payment.isPending)
      .reduce((acc, payment) => acc + toNumber(payment.percent ?? 0), 0),
  );
  const cappedPaid = Math.min(100, Math.max(0, paidPercent));
  const pendingPercent = round2(Math.max(0, 100 - cappedPaid));
  const pendingAmount = round2((total * pendingPercent) / 100);
  const paidAmount = round2(total - pendingAmount);

  const paidByMethod: PaymentsDashboardPaidSlice[] = quote.payments
    .filter((payment) => !payment.isPending && toNumber(payment.percent ?? 0) > 0)
    .map((payment) => {
      const percent = round2(toNumber(payment.percent ?? 0));
      return {
        paymentMethodId: payment.paymentMethodId,
        name: payment.paymentMethod?.name ?? 'Medio de pago',
        percent,
        amount: round2((total * percent) / 100),
      };
    });

  const pendingMethods = quote.payments.filter((payment) => payment.isPending);
  const pendingByMethod: PaymentsDashboardMethodSlice[] = [];
  if (pendingAmount >= 0.01) {
    if (pendingMethods.length === 0) {
      pendingByMethod.push({
        paymentMethodId: 'unassigned',
        name: 'Sin medio asignado',
        amount: pendingAmount,
      });
    } else {
      const share = round2(pendingAmount / pendingMethods.length);
      let allocated = 0;
      pendingMethods.forEach((payment, index) => {
        const amount =
          index === pendingMethods.length - 1
            ? round2(pendingAmount - allocated)
            : share;
        allocated = round2(allocated + amount);
        pendingByMethod.push({
          paymentMethodId: payment.paymentMethodId,
          name: payment.paymentMethod?.name ?? 'Medio de pago',
          amount,
        });
      });
    }
  }

  let clientKind: PaymentsDashboardClientKind | null = null;
  let clientId: string | null = null;
  let clientName = 'Sin cliente';
  if (quote.particularClient) {
    clientKind = 'particular';
    clientId = quote.particularClient.id;
    clientName = quote.particularClient.name;
  } else if (quote.building) {
    clientKind = 'building';
    clientId = quote.building.id;
    clientName = quote.building.name;
  } else if (quote.eventualClient) {
    clientKind = 'eventual';
    clientId = quote.eventualClient.id;
    clientName = quote.eventualClient.name;
  }

  return {
    id: quote.id,
    number: quote.number,
    status: quote.status,
    requestDate: quote.requestDate,
    total,
    paidPercent: cappedPaid,
    paidAmount,
    pendingPercent,
    pendingAmount,
    serviceStatus: quoteServiceStatus(quote.workOrders),
    clientKind,
    clientId,
    clientName,
    branchName: quote.branch?.name ?? null,
    pendingByMethod,
    paidByMethod,
    workOrders: quote.workOrders,
  };
}

function groupPaymentsDashboardClients(quotes: PaymentsDashboardQuote[]) {
  const groups = new Map<
    string,
    {
      key: string;
      kind: PaymentsDashboardClientKind | 'unknown';
      kindLabel: string;
      clientId: string | null;
      name: string;
      pendingAmount: number;
      paidAmount: number;
      quotes: PaymentsDashboardQuote[];
    }
  >();

  for (const quote of quotes) {
    const kind = quote.clientKind ?? 'unknown';
    const key = quote.clientId ? `${kind}:${quote.clientId}` : `quote:${quote.id}`;
    const current = groups.get(key) ?? {
      key,
      kind,
      kindLabel:
        kind === 'particular'
          ? 'Particular'
          : kind === 'building'
            ? 'Edificio'
            : kind === 'eventual'
              ? 'Eventual'
              : '—',
      clientId: quote.clientId,
      name: quote.clientName,
      pendingAmount: 0,
      paidAmount: 0,
      quotes: [],
    };
    current.pendingAmount = round2(current.pendingAmount + quote.pendingAmount);
    current.paidAmount = round2(current.paidAmount + quote.paidAmount);
    current.quotes.push(quote);
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      kind: group.kind,
      kindLabel: group.kindLabel,
      clientId: group.clientId,
      name: group.name,
      quoteCount: group.quotes.length,
      pendingAmount: group.pendingAmount,
      paidAmount: group.paidAmount,
      serviceStatus: rollupServiceStatus(group.quotes.map((quote) => quote.serviceStatus)),
      quotes: group.quotes
        .slice()
        .sort((a, b) => b.pendingAmount - a.pendingAmount)
        .map((quote) => ({
          id: quote.id,
          number: quote.number,
          status: quote.status,
          requestDate: quote.requestDate,
          total: quote.total,
          paidPercent: quote.paidPercent,
          paidAmount: quote.paidAmount,
          pendingPercent: quote.pendingPercent,
          pendingAmount: quote.pendingAmount,
          serviceStatus: quote.serviceStatus,
          branchName: quote.branchName,
          pendingByMethod: quote.pendingByMethod,
          paidByMethod: quote.paidByMethod,
          workOrders: quote.workOrders,
        })),
    }))
    .sort((a, b) => b.pendingAmount - a.pendingAmount);
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
