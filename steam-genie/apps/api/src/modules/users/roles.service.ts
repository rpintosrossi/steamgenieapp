import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  ALL_APP_MODULES,
  APP_MODULE_GROUPS,
  ROLES,
  type AppModuleKey,
} from '@steam-genie/shared-constants';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const ROLE_SELECT = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  permissions: { select: { moduleKey: true } },
  _count: { select: { userBuildingRoles: true } },
} as const;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  getModuleCatalog() {
    return {
      modules: ALL_APP_MODULES,
      groups: APP_MODULE_GROUPS,
    };
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: ROLE_SELECT,
    });
    return roles.map((role) => this.mapRole(role));
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: ROLE_SELECT,
    });
    if (!role) throw new NotFoundException('Rol no encontrado');
    return this.mapRole(role);
  }

  async create(dto: CreateRoleDto) {
    const name = dto.name.trim().toLowerCase();
    this.assertValidRoleName(name);

    const existing = await this.prisma.role.findUnique({ where: { name } });
    if (existing) throw new ConflictException('Ya existe un rol con ese nombre');

    const modules = this.normalizeModules(dto.modules);

    const role = await this.prisma.role.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        isSystem: false,
        permissions: {
          create: modules.map((moduleKey) => ({ moduleKey })),
        },
      },
      select: ROLE_SELECT,
    });

    return this.mapRole(role);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rol no encontrado');

    if (dto.name !== undefined && role.isSystem) {
      throw new BadRequestException('No se puede renombrar un rol del sistema');
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim().toLowerCase();
      this.assertValidRoleName(name);
      if (name !== role.name) {
        const existing = await this.prisma.role.findUnique({ where: { name } });
        if (existing) throw new ConflictException('Ya existe un rol con ese nombre');
      }
    }

    const modules = dto.modules !== undefined ? this.normalizeModules(dto.modules) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (modules !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (modules.length > 0) {
          await tx.rolePermission.createMany({
            data: modules.map((moduleKey) => ({ roleId: id, moduleKey })),
          });
        }
      }

      return tx.role.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim().toLowerCase() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
        },
        select: ROLE_SELECT,
      });
    });

    return this.mapRole(updated);
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isSystem: true,
        _count: { select: { userBuildingRoles: true } },
      },
    });
    if (!role) throw new NotFoundException('Rol no encontrado');
    if (role.isSystem) {
      throw new BadRequestException('No se pueden eliminar roles del sistema');
    }
    if (role._count.userBuildingRoles > 0) {
      throw new BadRequestException(
        'No se puede eliminar un rol asignado a usuarios. Reasigná los usuarios primero.',
      );
    }

    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }

  async getUserModules(userId: string): Promise<AppModuleKey[]> {
    const assignments = await this.prisma.userBuildingRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            permissions: { select: { moduleKey: true } },
          },
        },
      },
    });

    const keys = new Set<string>();
    for (const assignment of assignments) {
      for (const permission of assignment.role.permissions) {
        keys.add(permission.moduleKey);
      }
    }

    return ALL_APP_MODULES.filter((key) => keys.has(key));
  }

  async syncRolePermissions(roleName: string, modules: AppModuleKey[]) {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (modules.length > 0) {
        await tx.rolePermission.createMany({
          data: modules.map((moduleKey) => ({ roleId: role.id, moduleKey })),
        });
      }
    });
  }

  private normalizeModules(modules: string[]): AppModuleKey[] {
    const unique = [...new Set(modules)];
    const invalid = unique.filter((key) => !ALL_APP_MODULES.includes(key as AppModuleKey));
    if (invalid.length > 0) {
      throw new BadRequestException(`Módulos inválidos: ${invalid.join(', ')}`);
    }
    return unique as AppModuleKey[];
  }

  private assertValidRoleName(name: string) {
    if (!/^[a-z][a-z0-9_]{1,48}$/.test(name)) {
      throw new BadRequestException(
        'El nombre debe usar minúsculas, números o guiones bajos (2–49 caracteres).',
      );
    }
    if (Object.values(ROLES).includes(name as (typeof ROLES)[keyof typeof ROLES]) === false) {
      // custom names are allowed; reserved names for system roles are still ok on create if not system
    }
  }

  private mapRole(role: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
    permissions: Array<{ moduleKey: string }>;
    _count: { userBuildingRoles: number };
  }) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      modules: role.permissions.map((p) => p.moduleKey as AppModuleKey),
      userCount: role._count.userBuildingRoles,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}
