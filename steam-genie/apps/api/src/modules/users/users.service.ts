import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  calendarDatePasswordDdMmYyyy,
  parseCalendarDateInput,
} from '@steam-genie/shared-constants';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { QueryUserDetailDto } from './dto/query-user-detail.dto';
import { AssignBuildingRoleDto } from './dto/assign-building-role.dto';
import { SyncBuildingRolesDto } from './dto/sync-building-roles.dto';
import { SyncBuildingUsersDto } from './dto/sync-building-users.dto';
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
      birthDateObj = parseCalendarDateInput(dto.birthDate);
      rawPassword = calendarDatePasswordDdMmYyyy(birthDateObj);
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
          ? {
              birthDate: dto.birthDate ? parseCalendarDateInput(dto.birthDate) : null,
            }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: USER_SELECT,
    });
  }

  async remove(id: string, cascade = false, actorId?: string) {
    await this.assertExists(id);

    if (actorId && actorId === id) {
      throw new BadRequestException('No podés eliminarte a vos mismo.');
    }

    if (cascade) {
      return this.removeWithCascade(id, actorId);
    }

    const reasons = await this.collectDeleteBlockers(id);
    if (reasons.length > 0) {
      throw new ConflictException(
        `No se puede eliminar el usuario: ${reasons.join('; ')}.`,
      );
    }

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'User deleted' };
  }

  private async collectDeleteBlockers(id: string): Promise<string[]> {
    const [
      roles,
      devices,
      attendances,
      assignments,
      openStockAlerts,
      grantedRoles,
      createdWorkOrders,
      createdShipments,
      createdCommissions,
    ] = await Promise.all([
      this.prisma.userBuildingRole.count({ where: { userId: id } }),
      this.prisma.userDevice.count({ where: { userId: id } }),
      this.prisma.attendance.count({ where: { userId: id, deletedAt: null } }),
      this.prisma.workOrderAssignment.count({ where: { userId: id } }),
      this.prisma.buildingStockAlert.count({
        where: { reportedById: id, status: 'OPEN' },
      }),
      this.prisma.userBuildingRole.count({ where: { grantedById: id } }),
      this.prisma.workOrder.count({ where: { createdById: id, deletedAt: null } }),
      this.prisma.stockShipmentOrder.count({ where: { createdById: id } }),
      this.prisma.commissionSettlement.count({ where: { createdById: id } }),
    ]);

    const reasons: string[] = [];
    if (roles > 0) {
      reasons.push(
        `tiene ${roles} rol${roles === 1 ? '' : 'es'} asignado${roles === 1 ? '' : 's'}`,
      );
    }
    if (devices > 0) {
      reasons.push(
        `tiene ${devices} dispositivo${devices === 1 ? '' : 's'} registrado${devices === 1 ? '' : 's'}`,
      );
    }
    if (attendances > 0) {
      reasons.push(
        `tiene ${attendances} fichaje${attendances === 1 ? '' : 's'}`,
      );
    }
    if (assignments > 0) {
      reasons.push(
        `tiene ${assignments} asignación${assignments === 1 ? '' : 'es'} a servicios`,
      );
    }
    if (openStockAlerts > 0) {
      reasons.push(
        `tiene ${openStockAlerts} alerta${openStockAlerts === 1 ? '' : 's'} de stock abierta${openStockAlerts === 1 ? '' : 's'}`,
      );
    }
    if (grantedRoles > 0) {
      reasons.push(
        `otorgó ${grantedRoles} asignación${grantedRoles === 1 ? '' : 'es'} de rol`,
      );
    }
    if (createdWorkOrders > 0) {
      reasons.push(
        `creó ${createdWorkOrders} servicio${createdWorkOrders === 1 ? '' : 's'} eventual${createdWorkOrders === 1 ? '' : 'es'}`,
      );
    }
    if (createdShipments > 0) {
      reasons.push(
        `creó ${createdShipments} pedido${createdShipments === 1 ? '' : 's'} de stock`,
      );
    }
    if (createdCommissions > 0) {
      reasons.push(
        `creó ${createdCommissions} comisión${createdCommissions === 1 ? '' : 'es'}/rendición${createdCommissions === 1 ? '' : 'es'}`,
      );
    }
    return reasons;
  }

  /**
   * Limpia asociaciones del usuario en orden FK y soft-deletea el usuario.
   * Los registros de edificio (servicios creados, etc.) se desvinculan o soft-deletean
   * sin borrar el historial operativo completo del edificio.
   */
  private async removeWithCascade(id: string, actorId?: string) {
    const now = new Date();

    await this.prisma.$transaction(
      async (tx) => {
        let fallbackGranter =
          actorId && actorId !== id
            ? actorId
            : (
                await tx.user.findFirst({
                  where: {
                    id: { not: id },
                    deletedAt: null,
                    isActive: true,
                    primaryRole: 'admin',
                  },
                  select: { id: true },
                })
              )?.id;

        if (!fallbackGranter) {
          fallbackGranter = (
            await tx.user.findFirst({
              where: { id: { not: id }, deletedAt: null, isActive: true },
              select: { id: true },
            })
          )?.id;
        }

        if (fallbackGranter) {
          await tx.userBuildingRole.updateMany({
            where: { grantedById: id },
            data: { grantedById: fallbackGranter },
          });
        } else {
          await tx.userBuildingRole.deleteMany({ where: { grantedById: id } });
        }

        await tx.userDevice.deleteMany({ where: { userId: id } });
        await tx.userBuildingRole.deleteMany({ where: { userId: id } });
        await tx.workOrderAssignment.deleteMany({ where: { userId: id } });
        await tx.serviceExecutionParticipant.deleteMany({ where: { userId: id } });
        await tx.buildingStockAlert.deleteMany({ where: { reportedById: id } });

        const attendances = await tx.attendance.findMany({
          where: { userId: id },
          select: { id: true },
        });
        const attendanceIds = attendances.map((a) => a.id);

        if (attendanceIds.length) {
          await tx.buildingStockAlert.deleteMany({
            where: { attendanceId: { in: attendanceIds } },
          });
          await tx.serviceExecutionParticipant.deleteMany({
            where: { attendanceId: { in: attendanceIds } },
          });
          await tx.attendance.updateMany({
            where: { id: { in: attendanceIds } },
            data: { deletedAt: now },
          });
        }

        await tx.syncConflict.deleteMany({ where: { userId: id } });
        await tx.syncOperation.deleteMany({ where: { userId: id } });

        await tx.attendance.updateMany({
          where: { correctedById: id },
          data: { correctedById: null },
        });
        await tx.syncConflict.updateMany({
          where: { resolvedById: id },
          data: { resolvedById: null },
        });
        await tx.domainEvent.updateMany({
          where: { triggeredById: id },
          data: { triggeredById: null },
        });
        await tx.auditLog.updateMany({
          where: { userId: id },
          data: { userId: null },
        });
        await tx.stockShipmentOrder.updateMany({
          where: { dispatchedById: id },
          data: { dispatchedById: null },
        });
        await tx.stockShipmentDestination.updateMany({
          where: { confirmedById: id },
          data: { confirmedById: null },
        });
        await tx.stockMovement.updateMany({
          where: { performedById: id },
          data: { performedById: null },
        });
        await tx.workOrderExpense.updateMany({
          where: { createdById: id },
          data: { createdById: null },
        });
        await tx.fixedExpense.updateMany({
          where: { createdById: id },
          data: { createdById: null },
        });
        await tx.commissionSettlement.updateMany({
          where: { beneficiaryUserId: id },
          data: { beneficiaryUserId: null },
        });
        await tx.commissionSettlementPdfVersion.updateMany({
          where: { createdById: id },
          data: { createdById: null },
        });

        // Soft-delete de servicios eventuales creados por el usuario (no borra el historial de otros).
        await tx.workOrder.updateMany({
          where: { createdById: id, deletedAt: null },
          data: { deletedAt: now },
        });

        await tx.user.update({
          where: { id },
          data: { deletedAt: now, isActive: false },
        });
      },
      { timeout: 120_000 },
    );

    return { message: 'User deleted with cascade' };
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

  async getBuildingUserRoles(buildingId: string) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, deletedAt: null },
    });
    if (!building) throw new NotFoundException('Building not found');

    const [assignments, globalAccess] = await Promise.all([
      this.prisma.userBuildingRole.findMany({
        where: { buildingId },
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              id: true,
              dni: true,
              fullName: true,
              primaryRole: true,
              isActive: true,
            },
          },
          role: { select: { id: true, name: true } },
          createdAt: true,
        },
        orderBy: [{ user: { fullName: 'asc' } }, { role: { name: 'asc' } }],
      }),
      this.prisma.userBuildingRole.findMany({
        where: {
          buildingId: null,
          role: { name: { in: ['admin', 'manager', 'cleaner', 'client', 'provider'] } },
          user: { deletedAt: null, isActive: true },
        },
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              id: true,
              dni: true,
              fullName: true,
              primaryRole: true,
              isActive: true,
            },
          },
          role: { select: { id: true, name: true } },
        },
        orderBy: { user: { fullName: 'asc' } },
      }),
    ]);

    return { assignments, globalAccess };
  }

  async syncBuildingUsers(
    buildingId: string,
    dto: SyncBuildingUsersDto,
    grantedById: string,
  ) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, deletedAt: null, isActive: true },
    });
    if (!building) throw new NotFoundException('Building not found');

    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException('Role not found');

    if (dto.userIds.length > 0) {
      const validCount = await this.prisma.user.count({
        where: { id: { in: dto.userIds }, deletedAt: null, isActive: true },
      });
      if (validCount !== dto.userIds.length) {
        throw new BadRequestException('One or more users are invalid or inactive');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const previousAssignments = await tx.userBuildingRole.findMany({
        where: { buildingId, roleId: dto.roleId },
        select: { userId: true },
      });

      await tx.userBuildingRole.deleteMany({
        where: { buildingId, roleId: dto.roleId },
      });

      if (dto.userIds.length > 0) {
        await tx.userBuildingRole.createMany({
          data: dto.userIds.map((userId) => ({
            userId,
            roleId: dto.roleId,
            buildingId,
            grantedById,
          })),
        });
      }

      const affectedUserIds = [
        ...new Set([
          ...previousAssignments.map((item) => item.userId),
          ...dto.userIds,
        ]),
      ];

      await this.recalculatePrimaryRolesForUsers(tx, affectedUserIds);
    });

    return this.getBuildingUserRoles(buildingId);
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

  private async recalculatePrimaryRolesForUsers(
    tx: Prisma.TransactionClient,
    userIds: string[],
  ) {
    if (userIds.length === 0) return;

    const assignments = await tx.userBuildingRole.findMany({
      where: { userId: { in: userIds } },
      include: { role: true },
    });

    const rolesByUser = new Map<string, string[]>();
    for (const assignment of assignments) {
      const current = rolesByUser.get(assignment.userId) ?? [];
      rolesByUser.set(assignment.userId, [...current, assignment.role.name]);
    }

    await Promise.all(
      userIds.map((userId) => {
        const primaryRole = this.resolvePrimaryRole(rolesByUser.get(userId) ?? []);
        return tx.user.update({ where: { id: userId }, data: { primaryRole } });
      }),
    );
  }

  private async assertExists(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
