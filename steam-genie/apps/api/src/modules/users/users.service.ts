import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { QueryUserDetailDto } from './dto/query-user-detail.dto';
import { AssignBuildingRoleDto } from './dto/assign-building-role.dto';
import { SyncBuildingRolesDto } from './dto/sync-building-roles.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';

const USER_SELECT = {
  id: true,
  dni: true,
  fullName: true,
  birthDate: true,
  primaryRole: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

const ROLE_HIERARCHY = ['admin', 'manager', 'cleaner', 'client', 'provider'];

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryUsersDto) {
    const { page = 1, limit = 20, search, role, buildingId, isActive, includeBuildingRoles } = query;
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { deletedAt: null };

    if (search) {
      where.OR = [
        { dni: { contains: search } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (role && buildingId) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            {
              buildingRoles: {
                some: { role: { name: role }, buildingId },
              },
            },
            {
              buildingRoles: {
                some: { role: { name: role }, buildingId: null },
              },
            },
          ],
        },
      ];
    } else if (role) {
      where.buildingRoles = { some: { role: { name: role } } };
    } else if (buildingId) {
      where.buildingRoles = { some: { buildingId } };
    }

    const shouldIncludeRoles = includeBuildingRoles || Boolean(role || buildingId);

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          ...USER_SELECT,
          ...(shouldIncludeRoles
            ? {
                buildingRoles: {
                  select: {
                    buildingId: true,
                    role: { select: { id: true, name: true } },
                    building: { select: { id: true, name: true } },
                  },
                },
              }
            : {}),
        },
        skip,
        take: limit,
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, query: QueryUserDetailDto = {}) {
    const includeDevices = query.includeDevices === true;

    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...USER_SELECT,
        buildingRoles: {
          select: {
            id: true,
            buildingId: true,
            building: { select: { id: true, name: true } },
            role: { select: { id: true, name: true } },
            createdAt: true,
          },
        },
        ...(includeDevices
          ? {
              devices: {
                where: { isActive: true },
                select: {
                  id: true,
                  deviceId: true,
                  platform: true,
                  appVersion: true,
                  lastSeenAt: true,
                  isActive: true,
                },
              },
            }
          : {}),
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, grantedById: string) {
    const existing = await this.prisma.user.findUnique({ where: { dni: dto.dni } });
    if (existing) throw new ConflictException('DNI already registered');

    // Default password = birthDate as DDMMYYYY, or '01012000' if no birthDate
    let rawPassword: string;
    let birthDateObj: Date | undefined;

    if (dto.birthDate) {
      birthDateObj = new Date(dto.birthDate);
      const d = String(birthDateObj.getUTCDate()).padStart(2, '0');
      const m = String(birthDateObj.getUTCMonth() + 1).padStart(2, '0');
      const y = birthDateObj.getUTCFullYear();
      rawPassword = `${d}${m}${y}`;
    } else {
      rawPassword = '01012000';
    }

    const passwordHash = await bcrypt.hash(rawPassword, 12);

    // Determine primaryRole from initial roles (highest hierarchy)
    let primaryRole = 'cleaner';
    if (dto.initialRoles?.length) {
      const roleIds = dto.initialRoles.map((r) => r.roleId);
      const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } } });
      const roleNames = roles.map((r) => r.name);
      for (const r of ROLE_HIERARCHY) {
        if (roleNames.includes(r)) {
          primaryRole = r;
          break;
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          dni: dto.dni,
          fullName: dto.fullName,
          birthDate: birthDateObj,
          passwordHash,
          primaryRole,
          isActive: dto.isActive ?? true,
        },
        select: USER_SELECT,
      });

      if (dto.initialRoles?.length) {
        await tx.userBuildingRole.createMany({
          data: dto.initialRoles.map((r) => ({
            userId: user.id,
            roleId: r.roleId,
            buildingId: r.buildingId ?? null,
            grantedById,
          })),
        });
      }

      return user;
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.assertExists(id);

    if (dto.dni) {
      const duplicate = await this.prisma.user.findFirst({
        where: { dni: dto.dni, id: { not: id }, deletedAt: null },
      });
      if (duplicate) throw new ConflictException('DNI already registered');
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.dni !== undefined ? { dni: dto.dni } : {}),
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.birthDate !== undefined
          ? { birthDate: dto.birthDate ? new Date(dto.birthDate) : null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: USER_SELECT,
    });
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'User deleted' };
  }

  async getBuildingRoles(userId: string) {
    await this.assertExists(userId);
    return this.prisma.userBuildingRole.findMany({
      where: { userId },
      select: {
        id: true,
        buildingId: true,
        building: { select: { id: true, name: true } },
        role: { select: { id: true, name: true } },
        createdAt: true,
      },
    });
  }

  async assignBuildingRole(userId: string, dto: AssignBuildingRoleDto, grantedById: string) {
    await this.assertExists(userId);

    const existing = await this.prisma.userBuildingRole.findFirst({
      where: { userId, roleId: dto.roleId, buildingId: dto.buildingId ?? null },
    });
    if (existing) throw new ConflictException('Role already assigned for this building');

    return this.prisma.userBuildingRole.create({
      data: {
        userId,
        roleId: dto.roleId,
        buildingId: dto.buildingId ?? null,
        grantedById,
      },
      select: {
        id: true,
        buildingId: true,
        building: { select: { id: true, name: true } },
        role: { select: { id: true, name: true } },
        createdAt: true,
      },
    });
  }

  async removeBuildingRole(userId: string, buildingRoleId: string) {
    await this.assertExists(userId);

    const role = await this.prisma.userBuildingRole.findFirst({
      where: { id: buildingRoleId, userId },
    });
    if (!role) throw new NotFoundException('Building role assignment not found');

    await this.prisma.userBuildingRole.delete({ where: { id: buildingRoleId } });
    return { message: 'Role removed' };
  }

  async syncBuildingRoles(userId: string, dto: SyncBuildingRolesDto, grantedById: string) {
    await this.assertExists(userId);

    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException('Role not found');

    if (dto.buildingIds.length > 0) {
      const validCount = await this.prisma.building.count({
        where: { id: { in: dto.buildingIds }, deletedAt: null, isActive: true },
      });
      if (validCount !== dto.buildingIds.length) {
        throw new BadRequestException('One or more buildings are invalid or inactive');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userBuildingRole.deleteMany({
        where: { userId, roleId: dto.roleId, buildingId: { not: null } },
      });

      if (dto.buildingIds.length > 0) {
        await tx.userBuildingRole.deleteMany({
          where: { userId, roleId: dto.roleId, buildingId: null },
        });

        await tx.userBuildingRole.createMany({
          data: dto.buildingIds.map((buildingId) => ({
            userId,
            roleId: dto.roleId,
            buildingId,
            grantedById,
          })),
        });
      } else {
        const existingGlobal = await tx.userBuildingRole.findFirst({
          where: { userId, roleId: dto.roleId, buildingId: null },
        });
        if (!existingGlobal) {
          await tx.userBuildingRole.create({
            data: {
              userId,
              roleId: dto.roleId,
              buildingId: null,
              grantedById,
            },
          });
        }
      }

      const assignments = await tx.userBuildingRole.findMany({
        where: { userId },
        include: { role: true },
      });

      const primaryRole = this.resolvePrimaryRole(assignments.map((a) => a.role.name));
      await tx.user.update({ where: { id: userId }, data: { primaryRole } });
    });

    return this.getBuildingRoles(userId);
  }

  async upsertDevice(userId: string, dto: RegisterDeviceDto) {
    return this.prisma.userDevice.upsert({
      where: { deviceId: dto.deviceId },
      create: {
        userId,
        deviceId: dto.deviceId,
        platform: dto.platform,
        pushToken: dto.pushToken,
        appVersion: dto.appVersion,
        lastSeenAt: new Date(),
      },
      update: {
        userId,
        platform: dto.platform,
        pushToken: dto.pushToken,
        appVersion: dto.appVersion,
        lastSeenAt: new Date(),
        isActive: true,
      },
      select: {
        id: true,
        deviceId: true,
        platform: true,
        appVersion: true,
        lastSeenAt: true,
        isActive: true,
      },
    });
  }

  async findRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true },
    });
  }

  private resolvePrimaryRole(roleNames: string[]): string {
    for (const roleName of ROLE_HIERARCHY) {
      if (roleNames.includes(roleName)) return roleName;
    }
    return roleNames[0] ?? 'cleaner';
  }

  private async assertExists(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
