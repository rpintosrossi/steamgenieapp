import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { QueryBuildingsDto } from './dto/query-buildings.dto';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
import { CreateFloorDto } from './dto/create-floor.dto';
import { UpdateFloorDto } from './dto/update-floor.dto';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { CreateSubzoneDto } from './dto/create-subzone.dto';
import { UpdateSubzoneDto } from './dto/update-subzone.dto';
import { parseCalendarDateInput } from '@steam-genie/shared-constants';
import type { AuthUser } from '@steam-genie/shared-types';
import type { QueryAssignableCleanersDto } from './dto/query-assignable-cleaners.dto';

const ACTIVE_ASSIGNMENT_STATUSES = ['PENDING', 'ACCEPTED'] as const;
const ACTIVE_WORK_ORDER_STATUSES = ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'] as const;

function formatStoredTime(value: Date | null): string | null {
  if (!value) return null;
  const h = value.getUTCHours();
  const m = value.getUTCMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

@Injectable()
export class BuildingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Buildings ─────────────────────────────────────────────────────────────

  async findAll(query: QueryBuildingsDto, user?: AuthUser) {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (user) {
      const canListAll = await this.canListAllBuildings(user);

      if (!canListAll) {
        const assignments = await this.prisma.userBuildingRole.findMany({
          where: { userId: user.id, buildingId: { not: null } },
          select: { buildingId: true },
        });
        const buildingIds = [
          ...new Set(
            assignments
              .map((item) => item.buildingId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];

        if (buildingIds.length === 0) {
          return { data: [], total: 0, page, limit, pages: 0 };
        }

        where.id = { in: buildingIds };
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.building.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.building.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const building = await this.prisma.building.findFirst({
      where: { id, deletedAt: null },
      include: {
        floors: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: {
            zones: {
              where: { deletedAt: null },
              orderBy: { name: 'asc' },
              include: {
                subzones: { where: { deletedAt: null }, orderBy: { name: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!building) throw new NotFoundException('Building not found');
    return building;
  }

  /** Jerarquía ligera (id + nombre) para selectores de ubicación. */
  async findHierarchy(id: string) {
    const building = await this.prisma.building.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        floors: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            sortOrder: true,
            buildingId: true,
            zones: {
              where: { deletedAt: null },
              orderBy: { name: 'asc' },
              select: {
                id: true,
                name: true,
                floorId: true,
                buildingId: true,
                subzones: {
                  where: { deletedAt: null },
                  orderBy: { name: 'asc' },
                  select: {
                    id: true,
                    name: true,
                    zoneId: true,
                    buildingId: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!building) throw new NotFoundException('Building not found');
    return building;
  }

  /** Limpiadores asignables en un edificio (rol cleaner global o del edificio). */
  async findAssignableCleaners(buildingId: string, query: QueryAssignableCleanersDto = {}) {
    await this.assertBuildingExists(buildingId);

    const cleaners = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        buildingRoles: {
          some: {
            role: { name: 'cleaner' },
            OR: [{ buildingId }, { buildingId: null }],
          },
        },
      },
      select: { id: true, fullName: true, dni: true },
      orderBy: { fullName: 'asc' },
    });

    type SameDayService = {
      workOrderId: string;
      title: string;
      zoneName: string | null;
      scheduledTime: string | null;
    };

    type PriorRejection = {
      reason: string | null;
      rejectedAt: string | null;
    };

    let enrichedCleaners = cleaners.map((cleaner) => ({
      ...cleaner,
      recommended: false,
      sameDayServices: [] as SameDayService[],
      priorRejection: null as PriorRejection | null,
    }));

    if (query.scheduledDate && cleaners.length > 0) {
      const scheduledDate = parseCalendarDateInput(query.scheduledDate);
      const cleanerIds = cleaners.map((cleaner) => cleaner.id);

      const assignments = await this.prisma.workOrderAssignment.findMany({
        where: {
          userId: { in: cleanerIds },
          status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
          workOrder: {
            buildingId,
            deletedAt: null,
            scheduledDate,
            ...(query.excludeWorkOrderId ? { id: { not: query.excludeWorkOrderId } } : {}),
            status: { in: [...ACTIVE_WORK_ORDER_STATUSES] },
          },
        },
        select: {
          userId: true,
          workOrder: {
            select: {
              id: true,
              title: true,
              scheduledTime: true,
              zone: { select: { name: true } },
            },
          },
        },
        orderBy: { workOrder: { scheduledTime: 'asc' } },
      });

      const servicesByUser = new Map<string, SameDayService[]>();
      for (const assignment of assignments) {
        const list = servicesByUser.get(assignment.userId) ?? [];
        list.push({
          workOrderId: assignment.workOrder.id,
          title: assignment.workOrder.title,
          zoneName: assignment.workOrder.zone?.name ?? null,
          scheduledTime: formatStoredTime(assignment.workOrder.scheduledTime),
        });
        servicesByUser.set(assignment.userId, list);
      }

      enrichedCleaners = cleaners.map((cleaner) => {
        const sameDayServices = servicesByUser.get(cleaner.id) ?? [];
        return {
          ...cleaner,
          recommended: sameDayServices.length > 0,
          sameDayServices,
          priorRejection: null,
        };
      });

      enrichedCleaners.sort((a, b) => {
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
        return a.fullName.localeCompare(b.fullName, 'es');
      });
    }

    if (query.excludeWorkOrderId && cleaners.length > 0) {
      const cleanerIds = cleaners.map((cleaner) => cleaner.id);
      const priorRejections = await this.prisma.workOrderAssignment.findMany({
        where: {
          workOrderId: query.excludeWorkOrderId,
          status: 'REJECTED',
          userId: { in: cleanerIds },
        },
        select: {
          userId: true,
          respondedAt: true,
          rejectionNote: true,
          rejectionReason: { select: { text: true } },
        },
        orderBy: { respondedAt: 'desc' },
      });

      const rejectionByUser = new Map<string, PriorRejection>();
      for (const row of priorRejections) {
        if (rejectionByUser.has(row.userId)) continue;
        rejectionByUser.set(row.userId, {
          reason: row.rejectionReason?.text ?? row.rejectionNote ?? null,
          rejectedAt: row.respondedAt?.toISOString() ?? null,
        });
      }

      enrichedCleaners = enrichedCleaners.map((cleaner) => ({
        ...cleaner,
        priorRejection: rejectionByUser.get(cleaner.id) ?? null,
      }));
    }

    let otherUsersOnBuilding: Array<{ id: string; fullName: string; dni: string; primaryRole: string }> = [];
    if (cleaners.length === 0) {
      const usersOnBuilding = await this.prisma.user.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          buildingRoles: { some: { buildingId } },
        },
        select: {
          id: true,
          fullName: true,
          dni: true,
          primaryRole: true,
          buildingRoles: {
            where: { buildingId },
            select: { role: { select: { name: true } } },
          },
        },
        orderBy: { fullName: 'asc' },
        take: 20,
      });

      otherUsersOnBuilding = usersOnBuilding
        .filter(
          (user) =>
            !user.buildingRoles.some((assignment) => assignment.role.name === 'cleaner'),
        )
        .map((user) => ({
          id: user.id,
          fullName: user.fullName,
          dni: user.dni,
          primaryRole: user.buildingRoles[0]?.role.name ?? user.primaryRole,
        }));
    }

    return { cleaners: enrichedCleaners, otherUsersOnBuilding };
  }

  async create(dto: CreateBuildingDto) {
    return this.prisma.building.create({
      data: {
        name: dto.name,
        address: dto.address,
        city: dto.city,
        province: dto.province,
        latitude: dto.latitude,
        longitude: dto.longitude,
        gpsRadiusM: dto.gpsRadiusM,
      },
    });
  }

  async update(id: string, dto: UpdateBuildingDto) {
    await this.assertBuildingExists(id);
    return this.prisma.building.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.province !== undefined ? { province: dto.province } : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        ...(dto.gpsRadiusM !== undefined ? { gpsRadiusM: dto.gpsRadiusM } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.assertBuildingExists(id);
    await this.prisma.building.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    return { message: 'Building deleted' };
  }

  // ─── Floors ────────────────────────────────────────────────────────────────

  async getFloors(buildingId: string) {
    await this.assertBuildingExists(buildingId);
    return this.prisma.floor.findMany({
      where: { buildingId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createFloor(buildingId: string, dto: CreateFloorDto) {
    await this.assertBuildingExists(buildingId);
    return this.prisma.floor.create({
      data: { name: dto.name, sortOrder: dto.sortOrder ?? 0, buildingId },
    });
  }

  async updateFloor(id: string, dto: UpdateFloorDto) {
    await this.assertFloorExists(id);
    return this.prisma.floor.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async removeFloor(id: string) {
    await this.assertFloorExists(id);
    await this.prisma.floor.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Floor deleted' };
  }

  // ─── Zones ─────────────────────────────────────────────────────────────────

  async getZones(floorId: string) {
    await this.assertFloorExists(floorId);
    return this.prisma.zone.findMany({
      where: { floorId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async createZone(floorId: string, dto: CreateZoneDto) {
    const floor = await this.assertFloorExists(floorId);
    return this.prisma.zone.create({
      data: { name: dto.name, floorId, buildingId: floor.buildingId, qrToken: randomUUID() },
    });
  }

  async updateZone(id: string, dto: UpdateZoneDto) {
    await this.assertZoneExists(id);
    return this.prisma.zone.update({
      where: { id },
      data: { ...(dto.name !== undefined ? { name: dto.name } : {}) },
    });
  }

  async removeZone(id: string) {
    await this.assertZoneExists(id);
    await this.prisma.zone.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Zone deleted' };
  }

  // ─── Subzones ──────────────────────────────────────────────────────────────

  async getSubzones(zoneId: string) {
    await this.assertZoneExists(zoneId);
    return this.prisma.subzone.findMany({
      where: { zoneId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async createSubzone(zoneId: string, dto: CreateSubzoneDto) {
    const zone = await this.assertZoneExists(zoneId);
    return this.prisma.subzone.create({
      data: { name: dto.name, zoneId, buildingId: zone.buildingId, qrToken: randomUUID() },
    });
  }

  async updateSubzone(id: string, dto: UpdateSubzoneDto) {
    await this.assertSubzoneExists(id);
    return this.prisma.subzone.update({
      where: { id },
      data: { ...(dto.name !== undefined ? { name: dto.name } : {}) },
    });
  }

  async removeSubzone(id: string) {
    await this.assertSubzoneExists(id);
    await this.prisma.subzone.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Subzone deleted' };
  }

  // ─── Assertions ────────────────────────────────────────────────────────────

  /** Admin (primaryRole) o staff con rol global en user_building_roles ve todos los edificios. */
  private async canListAllBuildings(user: AuthUser): Promise<boolean> {
    if (user.primaryRole === 'admin') return true;

    const globalStaff = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: user.id,
        buildingId: null,
        role: { name: { in: ['admin', 'manager'] } },
      },
    });
    return Boolean(globalStaff);
  }

  private async assertBuildingExists(id: string) {
    const b = await this.prisma.building.findFirst({ where: { id, deletedAt: null } });
    if (!b) throw new NotFoundException('Building not found');
    return b;
  }

  private async assertFloorExists(id: string) {
    const f = await this.prisma.floor.findFirst({ where: { id, deletedAt: null } });
    if (!f) throw new NotFoundException('Floor not found');
    return f;
  }

  private async assertZoneExists(id: string) {
    const z = await this.prisma.zone.findFirst({ where: { id, deletedAt: null } });
    if (!z) throw new NotFoundException('Zone not found');
    return z;
  }

  private async assertSubzoneExists(id: string) {
    const s = await this.prisma.subzone.findFirst({ where: { id, deletedAt: null } });
    if (!s) throw new NotFoundException('Subzone not found');
    return s;
  }
}
