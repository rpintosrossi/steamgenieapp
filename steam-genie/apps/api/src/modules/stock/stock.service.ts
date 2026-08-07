import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockUnitType, StockWarehouseType } from '@prisma/client';
import {
  computeStockStatus,
  type StockStatus,
} from '@steam-genie/shared-constants';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { ensureStockBalance } from '../stock-logistics/stock-logistics.helpers';
import { recordStockMovement } from '../stock-logistics/stock-movements.record';
import { StockMovementsService } from '../stock-logistics/stock-movements.service';
import { CreateStockCategoryDto } from './dto/create-stock-category.dto';
import { UpdateStockCategoryDto } from './dto/update-stock-category.dto';
import { CreateStockSupplierDto } from './dto/create-stock-supplier.dto';
import { UpdateStockSupplierDto } from './dto/update-stock-supplier.dto';
import { CreateStockProductDto } from './dto/create-stock-product.dto';
import { UpdateStockProductDto } from './dto/update-stock-product.dto';
import { QueryStockProductsDto } from './dto/query-stock-products.dto';
import { AdjustStockProductDto } from './dto/adjust-stock-product.dto';
import { BulkAdjustStockDto } from './dto/bulk-adjust-stock.dto';
import { CreateStockWarehouseDto } from './dto/create-stock-warehouse.dto';
import { UpdateStockWarehouseDto } from './dto/update-stock-warehouse.dto';

const DATASHEET_MAX_BYTES = 15 * 1024 * 1024;
const DATASHEET_ALLOWED_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/octet-stream',
]);

const CATEGORY_SELECT = {
  id: true,
  name: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SUPPLIER_SELECT = {
  id: true,
  name: true,
  contactEmail: true,
  contactPhone: true,
  observations: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const WAREHOUSE_SELECT = {
  id: true,
  name: true,
  type: true,
  buildingId: true,
  notes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  building: { select: { id: true, name: true } },
} as const;

const PRODUCT_BASE_SELECT = {
  id: true,
  name: true,
  sku: true,
  description: true,
  categoryId: true,
  supplierId: true,
  unitType: true,
  datasheetStorageKey: true,
  datasheetFileName: true,
  datasheetMimeType: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  category: { select: CATEGORY_SELECT },
  supplier: { select: SUPPLIER_SELECT },
} as const;

type ProductBaseRow = Prisma.StockProductGetPayload<{ select: typeof PRODUCT_BASE_SELECT }>;

type BalanceQty = {
  quantity: Prisma.Decimal | number;
  reservedQuantity: Prisma.Decimal | number;
  minQuantity: Prisma.Decimal | number;
  stockUpdatedAt: Date;
};

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movementsService: StockMovementsService,
    private readonly storage: StorageService,
  ) {}

  async listProductMovements(productId: string, limit?: number, warehouseId?: string) {
    await this.assertProductExists(productId);
    return this.movementsService.list({ productId, limit, warehouseId });
  }

  // ─── Warehouses ────────────────────────────────────────────────────────────

  async findAllWarehouses(includeInactive = false) {
    const warehouses = await this.prisma.stockWarehouse.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        ...WAREHOUSE_SELECT,
        _count: { select: { balances: true } },
      },
      orderBy: { name: 'asc' },
    });

    return warehouses.map((w) => ({
      ...w,
      productCount: w._count.balances,
      _count: undefined,
    }));
  }

  async findWarehouseById(id: string) {
    const warehouse = await this.prisma.stockWarehouse.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...WAREHOUSE_SELECT,
        _count: { select: { balances: true } },
      },
    });
    if (!warehouse) throw new NotFoundException('Depósito no encontrado');
    return {
      ...warehouse,
      productCount: warehouse._count.balances,
      _count: undefined,
    };
  }

  async createWarehouse(dto: CreateStockWarehouseDto) {
    const name = dto.name.trim();
    await this.assertWarehouseNameAvailable(name);

    const type = dto.type ?? StockWarehouseType.COMPANY;
    if (type === StockWarehouseType.CLIENT) {
      if (!dto.buildingId) {
        throw new BadRequestException(
          'Un depósito de cliente debe estar vinculado a un edificio.',
        );
      }
      await this.assertBuildingExists(dto.buildingId);
    } else if (dto.buildingId) {
      throw new BadRequestException(
        'Solo los depósitos de tipo cliente pueden vincularse a un edificio.',
      );
    }

    return this.prisma.stockWarehouse.create({
      data: {
        name,
        type,
        buildingId: dto.buildingId ?? null,
        notes: dto.notes?.trim() || null,
        isActive: true,
      },
      select: WAREHOUSE_SELECT,
    });
  }

  async updateWarehouse(id: string, dto: UpdateStockWarehouseDto) {
    const existing = await this.assertWarehouseExists(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== existing.name) {
        await this.assertWarehouseNameAvailable(name, id);
      }
    }

    const nextType = dto.type ?? existing.type;
    const nextBuildingId =
      dto.buildingId !== undefined ? dto.buildingId : existing.buildingId;

    if (nextType === StockWarehouseType.CLIENT) {
      if (!nextBuildingId) {
        throw new BadRequestException(
          'Un depósito de cliente debe estar vinculado a un edificio.',
        );
      }
      await this.assertBuildingExists(nextBuildingId);
    } else if (nextBuildingId) {
      throw new BadRequestException(
        'Solo los depósitos de tipo cliente pueden vincularse a un edificio.',
      );
    }

    return this.prisma.stockWarehouse.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.buildingId !== undefined ? { buildingId: dto.buildingId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(nextType === StockWarehouseType.COMPANY ? { buildingId: null } : {}),
      },
      select: WAREHOUSE_SELECT,
    });
  }

  async removeWarehouse(id: string) {
    await this.assertWarehouseExists(id);

    const withStock = await this.prisma.stockBalance.count({
      where: {
        warehouseId: id,
        OR: [{ quantity: { gt: 0 } }, { reservedQuantity: { gt: 0 } }],
      },
    });
    if (withStock > 0) {
      throw new ConflictException(
        'No se puede eliminar un depósito con stock o reservas. Trasladá el stock antes.',
      );
    }

    const openShipments = await this.prisma.stockShipmentOrder.count({
      where: {
        sourceWarehouseId: id,
        status: { in: ['DRAFT', 'DISPATCHED'] },
      },
    });
    if (openShipments > 0) {
      throw new ConflictException(
        'No se puede eliminar un depósito con órdenes de envío abiertas.',
      );
    }

    await this.prisma.stockWarehouse.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Depósito eliminado' };
  }

  // ─── Stats & grouped listing ───────────────────────────────────────────────

  async getStats(warehouseId?: string) {
    if (warehouseId) {
      await this.assertWarehouseExists(warehouseId);

      const balances = await this.prisma.stockBalance.findMany({
        where: {
          warehouseId,
          product: { deletedAt: null, isActive: true },
          warehouse: { deletedAt: null, isActive: true },
        },
        select: {
          quantity: true,
          reservedQuantity: true,
          minQuantity: true,
        },
      });

      let lowStock = 0;
      let outOfStock = 0;
      for (const balance of balances) {
        const qty =
          this.toNumber(balance.quantity) - this.toNumber(balance.reservedQuantity);
        const status = computeStockStatus(qty, this.toNumber(balance.minQuantity));
        if (status === 'OUT') outOfStock += 1;
        else if (status === 'LOW') lowStock += 1;
      }

      return {
        totalProducts: balances.length,
        lowStock,
        outOfStock,
      };
    }

    const balances = await this.prisma.stockBalance.findMany({
      where: {
        product: { deletedAt: null, isActive: true },
        warehouse: { deletedAt: null, isActive: true },
      },
      select: {
        quantity: true,
        reservedQuantity: true,
        minQuantity: true,
      },
    });

    let lowStock = 0;
    let outOfStock = 0;
    for (const balance of balances) {
      const qty =
        this.toNumber(balance.quantity) - this.toNumber(balance.reservedQuantity);
      const status = computeStockStatus(qty, this.toNumber(balance.minQuantity));
      if (status === 'OUT') outOfStock += 1;
      else if (status === 'LOW') lowStock += 1;
    }

    return {
      totalProducts: balances.length,
      lowStock,
      outOfStock,
    };
  }

  async findProductsGrouped(query: QueryStockProductsDto) {
    if (!query.warehouseId) {
      throw new BadRequestException('Debés indicar el depósito (warehouseId).');
    }
    await this.assertWarehouseExists(query.warehouseId);

    const where = this.buildProductWhere(query);
    const orderBy = [
      { category: { sortOrder: 'asc' as const } },
      { category: { name: 'asc' as const } },
      { name: 'asc' as const },
    ];
    const paginate = query.page !== undefined || query.limit !== undefined;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const warehouseId = query.warehouseId;

    if (!paginate) {
      const products = await this.prisma.stockProduct.findMany({
        where,
        select: PRODUCT_BASE_SELECT,
        orderBy,
      });
      const mapped = await this.mapProductsWithBalances(products, warehouseId);
      return { groups: this.groupByCategory(mapped) };
    }

    if (query.status) {
      const products = await this.prisma.stockProduct.findMany({
        where,
        select: PRODUCT_BASE_SELECT,
        orderBy,
      });
      const mapped = await this.mapProductsWithBalances(products, warehouseId);
      const matching = mapped.filter((p) => p.status === query.status);
      const total = matching.length;
      const pages = Math.max(1, Math.ceil(total / limit));
      const pageItems = matching.slice((page - 1) * limit, page * limit);

      return {
        groups: this.groupByCategory(pageItems),
        total,
        page,
        limit,
        pages,
      };
    }

    const [total, products] = await Promise.all([
      this.prisma.stockProduct.count({ where }),
      this.prisma.stockProduct.findMany({
        where,
        select: PRODUCT_BASE_SELECT,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const mapped = await this.mapProductsWithBalances(products, warehouseId);
    const pages = Math.max(1, Math.ceil(total / limit));

    return {
      groups: this.groupByCategory(mapped),
      total,
      page,
      limit,
      pages,
    };
  }

  // ─── Categories ────────────────────────────────────────────────────────────

  async findAllCategories(includeInactive = false) {
    return this.prisma.stockCategory.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        ...CATEGORY_SELECT,
        _count: { select: { products: { where: { deletedAt: null } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(dto: CreateStockCategoryDto) {
    const name = dto.name.trim();
    await this.assertCategoryNameAvailable(name);

    return this.prisma.stockCategory.create({
      data: {
        name,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      },
      select: CATEGORY_SELECT,
    });
  }

  async updateCategory(id: string, dto: UpdateStockCategoryDto) {
    const existing = await this.assertCategoryExists(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== existing.name) {
        await this.assertCategoryNameAvailable(name, id);
      }
    }

    return this.prisma.stockCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: CATEGORY_SELECT,
    });
  }

  async removeCategory(id: string) {
    await this.assertCategoryExists(id);

    const productCount = await this.prisma.stockProduct.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (productCount > 0) {
      throw new ConflictException(
        'No se puede eliminar una categoría con productos asignados.',
      );
    }

    await this.prisma.stockCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Categoría eliminada' };
  }

  // ─── Suppliers ─────────────────────────────────────────────────────────────

  async findAllSuppliers(includeInactive = false) {
    return this.prisma.stockSupplier.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        ...SUPPLIER_SELECT,
        _count: { select: { products: { where: { deletedAt: null } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(dto: CreateStockSupplierDto) {
    const name = dto.name.trim();
    await this.assertSupplierNameAvailable(name);

    return this.prisma.stockSupplier.create({
      data: {
        name,
        contactEmail: dto.contactEmail?.trim() || null,
        contactPhone: dto.contactPhone?.trim() || null,
        observations: dto.observations?.trim() || null,
        isActive: true,
      },
      select: SUPPLIER_SELECT,
    });
  }

  async updateSupplier(id: string, dto: UpdateStockSupplierDto) {
    const existing = await this.assertSupplierExists(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== existing.name) {
        await this.assertSupplierNameAvailable(name, id);
      }
    }

    return this.prisma.stockSupplier.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.contactEmail !== undefined
          ? { contactEmail: dto.contactEmail?.trim() || null }
          : {}),
        ...(dto.contactPhone !== undefined
          ? { contactPhone: dto.contactPhone?.trim() || null }
          : {}),
        ...(dto.observations !== undefined
          ? { observations: dto.observations?.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: SUPPLIER_SELECT,
    });
  }

  async removeSupplier(id: string) {
    await this.assertSupplierExists(id);

    await this.prisma.stockSupplier.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Proveedor eliminado' };
  }

  // ─── Products ────────────────────────────────────────────────────────────────

  async createProduct(dto: CreateStockProductDto, performedById: string) {
    await this.assertCategoryExists(dto.categoryId);
    if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);
    if (!dto.warehouseId) {
      throw new BadRequestException('Debés indicar el depósito (warehouseId).');
    }
    await this.assertWarehouseExists(dto.warehouseId);

    const initialQty = dto.quantity ?? 0;
    const minQuantity = dto.minQuantity ?? 5;

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stockProduct.create({
        data: {
          name: dto.name.trim(),
          sku: dto.sku?.trim() || null,
          description: dto.description?.trim() || null,
          categoryId: dto.categoryId,
          supplierId: dto.supplierId ?? null,
          unitType: dto.unitType ?? StockUnitType.UNIT,
          isActive: true,
        },
        select: PRODUCT_BASE_SELECT,
      });

      await tx.stockBalance.create({
        data: {
          warehouseId: dto.warehouseId!,
          productId: created.id,
          quantity: initialQty,
          reservedQuantity: 0,
          minQuantity,
          stockUpdatedAt: new Date(),
        },
      });

      if (initialQty > 0) {
        await recordStockMovement(tx, {
          scope: 'DEPOT',
          movementType: 'DEPOT_INITIAL',
          productId: created.id,
          warehouseId: dto.warehouseId,
          quantityBefore: 0,
          quantityDelta: initialQty,
          quantityAfter: initialQty,
          performedById,
        });
      }

      return created;
    });

    const [mapped] = await this.mapProductsWithBalances([product], dto.warehouseId);
    return mapped;
  }

  async updateProduct(id: string, dto: UpdateStockProductDto, performedById: string) {
    const existing = await this.assertProductExists(id);

    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);
    if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);

    if (dto.quantity !== undefined && dto.quantity < 0) {
      throw new BadRequestException('La cantidad no puede ser negativa.');
    }

    const quantityChanged = dto.quantity !== undefined || dto.minQuantity !== undefined;
    if (quantityChanged && !dto.warehouseId) {
      throw new BadRequestException(
        'Debés indicar el depósito (warehouseId) para actualizar cantidades.',
      );
    }

    if (dto.warehouseId) await this.assertWarehouseExists(dto.warehouseId);

    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockProduct.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.sku !== undefined ? { sku: dto.sku?.trim() || null } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}),
          ...(dto.unitType !== undefined ? { unitType: dto.unitType } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        select: PRODUCT_BASE_SELECT,
      });

      if (dto.warehouseId && (dto.quantity !== undefined || dto.minQuantity !== undefined)) {
        await ensureStockBalance(tx, dto.warehouseId, id, dto.minQuantity ?? 5);
        const balance = await tx.stockBalance.findUnique({
          where: {
            warehouseId_productId: { warehouseId: dto.warehouseId, productId: id },
          },
        });
        if (!balance) throw new NotFoundException('Saldo de depósito no encontrado');

        const currentQty = this.toNumber(balance.quantity);

        await tx.stockBalance.update({
          where: { id: balance.id },
          data: {
            ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
            ...(dto.minQuantity !== undefined ? { minQuantity: dto.minQuantity } : {}),
            ...(dto.quantity !== undefined ? { stockUpdatedAt: new Date() } : {}),
          },
        });

        if (dto.quantity !== undefined && dto.quantity !== currentQty) {
          await recordStockMovement(tx, {
            scope: 'DEPOT',
            movementType: 'DEPOT_SET',
            productId: id,
            warehouseId: dto.warehouseId,
            quantityBefore: currentQty,
            quantityDelta: dto.quantity - currentQty,
            quantityAfter: dto.quantity,
            performedById,
          });
        }
      }

      return updated;
    });

    if (dto.warehouseId) {
      const [mapped] = await this.mapProductsWithBalances([product], dto.warehouseId);
      return mapped;
    }

    return {
      ...product,
      quantity: 0,
      reservedQuantity: 0,
      available: 0,
      minQuantity: 5,
      status: 'OUT' as StockStatus,
      stockUpdatedAt: existing.updatedAt,
      category: product.category,
      supplier: product.supplier,
    };
  }

  async adjustProduct(
    id: string,
    dto: AdjustStockProductDto,
    performedById: string,
  ) {
    if (!dto.warehouseId) {
      throw new BadRequestException('Debés indicar el depósito (warehouseId).');
    }
    await this.assertProductExists(id);
    await this.assertWarehouseExists(dto.warehouseId);

    const product = await this.prisma.$transaction(async (tx) => {
      await ensureStockBalance(tx, dto.warehouseId!, id);
      const balance = await tx.stockBalance.findUnique({
        where: {
          warehouseId_productId: { warehouseId: dto.warehouseId!, productId: id },
        },
      });
      if (!balance) throw new NotFoundException('Saldo de depósito no encontrado');

      const current = this.toNumber(balance.quantity);
      const next = current + dto.delta;

      if (next < 0) {
        throw new BadRequestException(
          `No hay stock suficiente. Disponible: ${current}`,
        );
      }

      await tx.stockBalance.update({
        where: { id: balance.id },
        data: {
          quantity: next,
          stockUpdatedAt: new Date(),
        },
      });

      await recordStockMovement(tx, {
        scope: 'DEPOT',
        movementType: 'DEPOT_ADJUST',
        productId: id,
        warehouseId: dto.warehouseId,
        quantityBefore: current,
        quantityDelta: dto.delta,
        quantityAfter: next,
        performedById,
      });

      return tx.stockProduct.findFirstOrThrow({
        where: { id },
        select: PRODUCT_BASE_SELECT,
      });
    });

    const [mapped] = await this.mapProductsWithBalances([product], dto.warehouseId);
    return mapped;
  }

  async bulkAdjust(dto: BulkAdjustStockDto, performedById: string) {
    if (!dto.warehouseId) {
      throw new BadRequestException('Debés indicar el depósito (warehouseId).');
    }
    if (dto.adjustments.length === 0) {
      throw new BadRequestException('Debe indicar al menos un ajuste.');
    }
    await this.assertWarehouseExists(dto.warehouseId);

    const results = await this.prisma.$transaction(async (tx) => {
      const updated: ProductBaseRow[] = [];

      for (const adjustment of dto.adjustments) {
        const existing = await tx.stockProduct.findFirst({
          where: { id: adjustment.productId, deletedAt: null },
        });
        if (!existing) {
          throw new NotFoundException(
            `Producto no encontrado: ${adjustment.productId}`,
          );
        }

        await ensureStockBalance(tx, dto.warehouseId!, adjustment.productId);
        const balance = await tx.stockBalance.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: dto.warehouseId!,
              productId: adjustment.productId,
            },
          },
        });
        if (!balance) throw new NotFoundException('Saldo de depósito no encontrado');

        const current = this.toNumber(balance.quantity);
        const next = current + adjustment.delta;
        if (next < 0) {
          throw new BadRequestException(
            `"${existing.name}": stock insuficiente (disponible: ${current}).`,
          );
        }

        await tx.stockBalance.update({
          where: { id: balance.id },
          data: {
            quantity: next,
            stockUpdatedAt: new Date(),
          },
        });

        await recordStockMovement(tx, {
          scope: 'DEPOT',
          movementType: 'DEPOT_ADJUST',
          productId: adjustment.productId,
          warehouseId: dto.warehouseId,
          quantityBefore: current,
          quantityDelta: adjustment.delta,
          quantityAfter: next,
          performedById,
          note: 'Ajuste masivo',
        });

        const product = await tx.stockProduct.findFirstOrThrow({
          where: { id: adjustment.productId },
          select: PRODUCT_BASE_SELECT,
        });
        updated.push(product);
      }

      return updated;
    });

    const mapped = await this.mapProductsWithBalances(results, dto.warehouseId);
    return { updated: mapped };
  }

  async removeProduct(id: string, warehouseId?: string) {
    await this.assertProductExists(id);

    if (warehouseId) {
      await this.assertWarehouseExists(warehouseId);
      const balance = await this.prisma.stockBalance.findUnique({
        where: { warehouseId_productId: { warehouseId, productId: id } },
      });
      if (!balance) {
        throw new NotFoundException('El producto no está en este depósito.');
      }

      await this.prisma.stockBalance.delete({ where: { id: balance.id } });

      const remaining = await this.prisma.stockBalance.count({
        where: { productId: id },
      });
      if (remaining === 0) {
        await this.prisma.stockProduct.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        });
      }

      return { message: 'Producto eliminado de este depósito' };
    }

    await this.prisma.stockProduct.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Producto eliminado' };
  }

  async uploadDatasheet(id: string, file: Express.Multer.File) {
    await this.assertProductExists(id);
    if (!file) {
      throw new BadRequestException('Archivo requerido (campo: file)');
    }
    if (file.size > DATASHEET_MAX_BYTES) {
      throw new BadRequestException(
        `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: 15 MB.`,
      );
    }
    const mime = file.mimetype || 'application/octet-stream';
    if (!DATASHEET_ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido (${mime}). Usá PDF, texto, Word, Excel o imagen.`,
      );
    }

    const existing = await this.prisma.stockProduct.findFirst({
      where: { id, deletedAt: null },
      select: { datasheetStorageKey: true },
    });

    const safeName = file.originalname.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 200);
    const storageKey = `stock-datasheets/${id}/${Date.now()}-${safeName}`;
    await this.storage.upload(storageKey, file.buffer, mime);

    if (existing?.datasheetStorageKey) {
      try {
        await this.storage.delete(existing.datasheetStorageKey);
      } catch {
        // best-effort cleanup
      }
    }

    const product = await this.prisma.stockProduct.update({
      where: { id },
      data: {
        datasheetStorageKey: storageKey,
        datasheetFileName: safeName,
        datasheetMimeType: mime,
      },
      select: PRODUCT_BASE_SELECT,
    });

    return {
      id: product.id,
      hasDatasheet: true,
      datasheetFileName: product.datasheetFileName,
      datasheetMimeType: product.datasheetMimeType,
      datasheetUrl: `/stock/products/${product.id}/datasheet`,
    };
  }

  async removeDatasheet(id: string) {
    const product = await this.assertProductExists(id);
    if (!product.datasheetStorageKey) {
      return { message: 'El producto no tiene ficha técnica' };
    }

    try {
      await this.storage.delete(product.datasheetStorageKey);
    } catch {
      // best-effort
    }

    await this.prisma.stockProduct.update({
      where: { id },
      data: {
        datasheetStorageKey: null,
        datasheetFileName: null,
        datasheetMimeType: null,
      },
    });

    return { message: 'Ficha técnica eliminada' };
  }

  async streamDatasheet(id: string) {
    const product = await this.prisma.stockProduct.findFirst({
      where: { id, deletedAt: null },
      select: {
        datasheetStorageKey: true,
        datasheetFileName: true,
        datasheetMimeType: true,
      },
    });
    if (!product?.datasheetStorageKey) {
      throw new NotFoundException('Ficha técnica no encontrada');
    }

    return {
      storageKey: product.datasheetStorageKey,
      fileName: product.datasheetFileName ?? 'ficha-tecnica',
      mimeType: product.datasheetMimeType ?? 'application/octet-stream',
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildProductWhere(query: QueryStockProductsDto): Prisma.StockProductWhereInput {
    const where: Prisma.StockProductWhereInput = { deletedAt: null };

    if (!query.includeInactive) where.isActive = true;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.supplierId) where.supplierId = query.supplierId;

    // Solo productos habilitados en este depósito (con saldo propio).
    if (query.warehouseId) {
      where.balances = { some: { warehouseId: query.warehouseId } };
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private groupByCategory(
    products: ReturnType<typeof this.mapProduct> extends infer T ? T[] : never,
  ) {
    const map = new Map<
      string,
      {
        category: { id: string; name: string; sortOrder: number };
        products: typeof products;
      }
    >();

    for (const product of products) {
      const key = product.category.id;
      if (!map.has(key)) {
        map.set(key, {
          category: {
            id: product.category.id,
            name: product.category.name,
            sortOrder: product.category.sortOrder,
          },
          products: [],
        });
      }
      map.get(key)!.products.push(product);
    }

    return [...map.values()].sort(
      (a, b) =>
        a.category.sortOrder - b.category.sortOrder ||
        a.category.name.localeCompare(b.category.name),
    );
  }

  private async mapProductsWithBalances(
    products: ProductBaseRow[],
    warehouseId: string,
  ) {
    if (products.length === 0) return [];

    const balances = await this.prisma.stockBalance.findMany({
      where: {
        warehouseId,
        productId: { in: products.map((p) => p.id) },
      },
      select: {
        productId: true,
        quantity: true,
        reservedQuantity: true,
        minQuantity: true,
        stockUpdatedAt: true,
      },
    });
    const byProduct = new Map(balances.map((b) => [b.productId, b]));

    return products.map((product) =>
      this.mapProduct(
        product,
        byProduct.get(product.id) ?? {
          quantity: 0,
          reservedQuantity: 0,
          minQuantity: 5,
          stockUpdatedAt: product.updatedAt,
        },
      ),
    );
  }

  private mapProduct(product: ProductBaseRow, balance: BalanceQty) {
    const quantity = this.toNumber(balance.quantity);
    const reservedQuantity = this.toNumber(balance.reservedQuantity);
    const available = quantity - reservedQuantity;
    const minQuantity = this.toNumber(balance.minQuantity);
    const status = computeStockStatus(available, minQuantity);
    const hasDatasheet = Boolean(product.datasheetStorageKey);

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      categoryId: product.categoryId,
      supplierId: product.supplierId,
      quantity,
      reservedQuantity,
      available,
      minQuantity,
      unitType: product.unitType,
      isActive: product.isActive,
      status: status as StockStatus,
      hasDatasheet,
      datasheetFileName: product.datasheetFileName,
      datasheetMimeType: product.datasheetMimeType,
      datasheetUrl: hasDatasheet ? `/stock/products/${product.id}/datasheet` : null,
      stockUpdatedAt: balance.stockUpdatedAt,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      category: product.category,
      supplier: product.supplier,
    };
  }

  private toNumber(value: Prisma.Decimal | number): number {
    return typeof value === 'number' ? value : value.toNumber();
  }

  private async assertCategoryExists(id: string) {
    const category = await this.prisma.stockCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }

  private async assertSupplierExists(id: string) {
    const supplier = await this.prisma.stockSupplier.findFirst({
      where: { id, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return supplier;
  }

  private async assertProductExists(id: string) {
    const product = await this.prisma.stockProduct.findFirst({
      where: { id, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  private async assertWarehouseExists(id: string) {
    const warehouse = await this.prisma.stockWarehouse.findFirst({
      where: { id, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('Depósito no encontrado');
    return warehouse;
  }

  private async assertBuildingExists(id: string) {
    const building = await this.prisma.building.findFirst({
      where: { id, deletedAt: null },
    });
    if (!building) throw new NotFoundException('Edificio no encontrado');
    return building;
  }

  private async assertCategoryNameAvailable(name: string, excludeId?: string) {
    const duplicate = await this.prisma.stockCategory.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException('Ya existe una categoría con ese nombre.');
    }
  }

  private async assertSupplierNameAvailable(name: string, excludeId?: string) {
    const duplicate = await this.prisma.stockSupplier.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException('Ya existe un proveedor con ese nombre.');
    }
  }

  private async assertWarehouseNameAvailable(name: string, excludeId?: string) {
    const duplicate = await this.prisma.stockWarehouse.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException('Ya existe un depósito con ese nombre.');
    }
  }
}
