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

@Injectable()
export class BuildingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Buildings ─────────────────────────────────────────────────────────────

  async findAll(query: QueryBuildingsDto) {
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
