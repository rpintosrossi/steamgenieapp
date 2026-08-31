import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthUser } from '@steam-genie/shared-types';
import { listAccessibleBranchIds } from '../../common/branch-access';
import {
  CreateQuoteBranchDto,
  QueryQuoteBranchesDto,
  UpdateQuoteBranchDto,
} from './dto/quote-branch.dto';

@Injectable()
export class QuoteBranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryQuoteBranchesDto, user?: AuthUser) {
    const where: Prisma.QuoteBranchWhereInput = {
      deletedAt: null,
      ...(query.includeInactive ? {} : { isActive: true }),
    };
    if (user) {
      const branchIds = await listAccessibleBranchIds(this.prisma, user.id);
      if (branchIds !== null) {
        if (branchIds.length === 0) return [];
        where.id = { in: branchIds };
      }
    }
    return this.prisma.quoteBranch.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { quotes: true } } },
    });
  }

  async create(dto: CreateQuoteBranchDto) {
    const name = dto.name.trim();
    const address = dto.address.trim();
    const phone = dto.phone.trim();
    if (!name) throw new BadRequestException('El nombre es obligatorio.');
    if (!address) throw new BadRequestException('La dirección es obligatoria.');
    if (!phone) throw new BadRequestException('El teléfono es obligatorio.');

    return this.prisma.$transaction(async (tx) => {
      const activeCount = await tx.quoteBranch.count({
        where: { deletedAt: null },
      });
      const makeDefault = dto.isDefault === true || activeCount === 0;

      if (makeDefault) {
        await tx.quoteBranch.updateMany({
          where: { deletedAt: null, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.quoteBranch.create({
        data: {
          name,
          address,
          phone,
          sortOrder: dto.sortOrder ?? 0,
          isDefault: makeDefault,
        },
      });
    });
  }

  async update(id: string, dto: UpdateQuoteBranchDto) {
    const existing = await this.assertExists(id);

    if (dto.isActive === false && existing.isDefault) {
      throw new BadRequestException(
        'No se puede desactivar la sucursal predeterminada. Asigná otra como predeterminada primero.',
      );
    }

    if (dto.isDefault === false && existing.isDefault) {
      throw new BadRequestException(
        'Tiene que haber una sucursal predeterminada. Marcá otra sucursal como predeterminada.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.quoteBranch.updateMany({
          where: { deletedAt: null, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.quoteBranch.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
    });
  }

  async remove(id: string) {
    const existing = await this.assertExists(id);

    return this.prisma.$transaction(async (tx) => {
      const remaining = await tx.quoteBranch.count({
        where: { deletedAt: null, id: { not: id } },
      });
      if (remaining === 0) {
        throw new BadRequestException(
          'No se puede eliminar la única sucursal. Creá otra antes de borrarla.',
        );
      }

      if (existing.isDefault) {
        const nextDefault = await tx.quoteBranch.findFirst({
          where: { deletedAt: null, isActive: true, id: { not: id } },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });
        if (!nextDefault) {
          throw new BadRequestException(
            'No hay otra sucursal activa para dejar como predeterminada.',
          );
        }
        await tx.quoteBranch.update({
          where: { id: nextDefault.id },
          data: { isDefault: true },
        });
      }

      return tx.quoteBranch.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false, isDefault: false },
      });
    });
  }

  private async assertExists(id: string) {
    const row = await this.prisma.quoteBranch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Sucursal no encontrada');
    return row;
  }
}

export async function resolveQuoteBranch(
  db: Prisma.TransactionClient | PrismaService,
  branchId?: string | null,
) {
  if (branchId) {
    const branch = await db.quoteBranch.findFirst({
      where: { id: branchId, deletedAt: null, isActive: true },
    });
    if (!branch) {
      throw new BadRequestException('Sucursal no encontrada o inactiva.');
    }
    return branch;
  }

  const preferred = await db.quoteBranch.findFirst({
    where: { deletedAt: null, isActive: true, isDefault: true },
  });
  if (preferred) return preferred;

  const fallback = await db.quoteBranch.findFirst({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  if (!fallback) {
    throw new BadRequestException(
      'No hay sucursales activas. Crealas en Configuración.',
    );
  }
  return fallback;
}
