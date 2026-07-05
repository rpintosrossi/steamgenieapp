import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockUnitType } from '@prisma/client';
import {
  computeStockStatus,
  type StockStatus,
} from '@steam-genie/shared-constants';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
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
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  description: true,
  categoryId: true,
  supplierId: true,
  quantity: true,
  reservedQuantity: true,
  minQuantity: true,
  unitType: true,
  isActive: true,
  stockUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: CATEGORY_SELECT },
  supplier: { select: SUPPLIER_SELECT },
} as const;

type ProductRow = Prisma.StockProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movementsService: StockMovementsService,
  ) {}

  async listProductMovements(productId: string, limit?: number) {
    await this.assertProductExists(productId);
    return this.movementsService.list({ productId, limit });
  }

  // ─── Stats & grouped listing ───────────────────────────────────────────────

  async getStats() {
    const products = await this.prisma.stockProduct.findMany({
      where: { deletedAt: null, isActive: true },
      select: { quantity: true, reservedQuantity: true, minQuantity: true },
    });

    let lowStock = 0;
    let outOfStock = 0;

    for (const product of products) {
      const qty =
        this.toNumber(product.quantity) - this.toNumber(product.reservedQuantity);
      const min = this.toNumber(product.minQuantity);
      const status = computeStockStatus(qty, min);
      if (status === 'OUT') outOfStock += 1;
      else if (status === 'LOW') lowStock += 1;
    }

    return {
      totalProducts: products.length,
      lowStock,
      outOfStock,
    };
  }

  async findProductsGrouped(query: QueryStockProductsDto) {
    const where = this.buildProductWhere(query);

    const products = await this.prisma.stockProduct.findMany({
      where,
      select: PRODUCT_SELECT,
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { category: { name: 'asc' } },
        { name: 'asc' },
      ],
    });

    const mapped = products.map((product) => this.mapProduct(product));
    const groups = this.groupByCategory(mapped);

    return { groups };
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

    const initialQty = dto.quantity ?? 0;

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stockProduct.create({
        data: {
          name: dto.name.trim(),
          sku: dto.sku?.trim() || null,
          description: dto.description?.trim() || null,
          categoryId: dto.categoryId,
          supplierId: dto.supplierId ?? null,
          quantity: initialQty,
          minQuantity: dto.minQuantity ?? 5,
          unitType: dto.unitType ?? StockUnitType.UNIT,
          isActive: true,
          stockUpdatedAt: new Date(),
        },
        select: PRODUCT_SELECT,
      });

      if (initialQty > 0) {
        await recordStockMovement(tx, {
          scope: 'DEPOT',
          movementType: 'DEPOT_INITIAL',
          productId: created.id,
          quantityBefore: 0,
          quantityDelta: initialQty,
          quantityAfter: initialQty,
          performedById,
        });
      }

      return created;
    });

    return this.mapProduct(product);
  }

  async updateProduct(id: string, dto: UpdateStockProductDto, performedById: string) {
    const existing = await this.assertProductExists(id);

    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);
    if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);

    if (dto.quantity !== undefined && dto.quantity < 0) {
      throw new BadRequestException('La cantidad no puede ser negativa.');
    }

    const quantityChanged = dto.quantity !== undefined;
    const currentQty = this.toNumber(existing.quantity);

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
          ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
          ...(dto.minQuantity !== undefined ? { minQuantity: dto.minQuantity } : {}),
          ...(dto.unitType !== undefined ? { unitType: dto.unitType } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(quantityChanged ? { stockUpdatedAt: new Date() } : {}),
        },
        select: PRODUCT_SELECT,
      });

      if (quantityChanged && dto.quantity !== undefined && dto.quantity !== currentQty) {
        await recordStockMovement(tx, {
          scope: 'DEPOT',
          movementType: 'DEPOT_SET',
          productId: id,
          quantityBefore: currentQty,
          quantityDelta: dto.quantity - currentQty,
          quantityAfter: dto.quantity,
          performedById,
        });
      }

      return updated;
    });

    return this.mapProduct(product);
  }

  async adjustProduct(id: string, dto: AdjustStockProductDto, performedById: string) {
    const existing = await this.assertProductExists(id);
    const current = this.toNumber(existing.quantity);
    const next = current + dto.delta;

    if (next < 0) {
      throw new BadRequestException(
        `No hay stock suficiente. Disponible: ${current}`,
      );
    }

    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockProduct.update({
        where: { id },
        data: {
          quantity: next,
          stockUpdatedAt: new Date(),
        },
        select: PRODUCT_SELECT,
      });

      await recordStockMovement(tx, {
        scope: 'DEPOT',
        movementType: 'DEPOT_ADJUST',
        productId: id,
        quantityBefore: current,
        quantityDelta: dto.delta,
        quantityAfter: next,
        performedById,
      });

      return updated;
    });

    return this.mapProduct(product);
  }

  async bulkAdjust(dto: BulkAdjustStockDto, performedById: string) {
    if (dto.adjustments.length === 0) {
      throw new BadRequestException('Debe indicar al menos un ajuste.');
    }

    const results = await this.prisma.$transaction(async (tx) => {
      const updated: ProductRow[] = [];

      for (const adjustment of dto.adjustments) {
        const existing = await tx.stockProduct.findFirst({
          where: { id: adjustment.productId, deletedAt: null },
        });
        if (!existing) {
          throw new NotFoundException(
            `Producto no encontrado: ${adjustment.productId}`,
          );
        }

        const current = this.toNumber(existing.quantity);
        const next = current + adjustment.delta;
        if (next < 0) {
          throw new BadRequestException(
            `"${existing.name}": stock insuficiente (disponible: ${current}).`,
          );
        }

        const product = await tx.stockProduct.update({
          where: { id: adjustment.productId },
          data: {
            quantity: next,
            stockUpdatedAt: new Date(),
          },
          select: PRODUCT_SELECT,
        });

        await recordStockMovement(tx, {
          scope: 'DEPOT',
          movementType: 'DEPOT_ADJUST',
          productId: adjustment.productId,
          quantityBefore: current,
          quantityDelta: adjustment.delta,
          quantityAfter: next,
          performedById,
          note: 'Ajuste masivo',
        });

        updated.push(product);
      }

      return updated;
    });

    return {
      updated: results.map((product) => this.mapProduct(product)),
    };
  }

  async removeProduct(id: string) {
    await this.assertProductExists(id);
    await this.prisma.stockProduct.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Producto eliminado' };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildProductWhere(query: QueryStockProductsDto): Prisma.StockProductWhereInput {
    const where: Prisma.StockProductWhereInput = { deletedAt: null };

    if (!query.includeInactive) where.isActive = true;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.supplierId) where.supplierId = query.supplierId;

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

  private mapProduct(product: ProductRow) {
    const quantity = this.toNumber(product.quantity);
    const reservedQuantity = this.toNumber(product.reservedQuantity);
    const available = quantity - reservedQuantity;
    const minQuantity = this.toNumber(product.minQuantity);
    const status = computeStockStatus(available, minQuantity);

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
      stockUpdatedAt: product.stockUpdatedAt,
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
}
