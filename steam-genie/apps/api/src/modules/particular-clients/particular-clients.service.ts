import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateParticularClientDto } from './dto/create-particular-client.dto';
import { UpdateParticularClientDto } from './dto/update-particular-client.dto';
import { QueryParticularClientsDto } from './dto/query-particular-clients.dto';

const BUILDING_SELECT = {
  id: true,
  name: true,
  address: true,
  city: true,
  province: true,
  latitude: true,
  longitude: true,
  gpsRadiusM: true,
  requireGpsValidation: true,
  buildingMode: true,
  photoEvidenceMode: true,
  isActive: true,
} satisfies Prisma.BuildingSelect;

const CLIENT_SELECT = {
  id: true,
  name: true,
  taxId: true,
  address: true,
  contactName: true,
  email: true,
  phone: true,
  notes: true,
  isActive: true,
  buildingId: true,
  createdAt: true,
  updatedAt: true,
  building: { select: BUILDING_SELECT },
} satisfies Prisma.ParticularClientSelect;

@Injectable()
export class ParticularClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryParticularClientsDto) {
    const { search, includeInactive } = query;
    const where: Prisma.ParticularClientWhereInput = { deletedAt: null };

    if (!includeInactive) where.isActive = true;

    const term = search?.trim();
    if (term) {
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { taxId: { contains: term, mode: 'insensitive' } },
        { contactName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { address: { contains: term, mode: 'insensitive' } },
        { building: { city: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.particularClient.findMany({
      where,
      select: CLIENT_SELECT,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    return this.assertExists(id);
  }

  async create(dto: CreateParticularClientDto) {
    const name = dto.name.trim();
    const address = emptyToNull(dto.address);
    const requireGpsValidation = dto.requireGpsValidation ?? true;

    if (requireGpsValidation && (dto.latitude == null || dto.longitude == null)) {
      throw new BadRequestException('Seleccioná la ubicación del cliente en el mapa.');
    }

    return this.prisma.$transaction(async (tx) => {
      const building = await tx.building.create({
        data: {
          name,
          address,
          city: emptyToNull(dto.city),
          province: emptyToNull(dto.province),
          latitude: dto.latitude,
          longitude: dto.longitude,
          gpsRadiusM: dto.gpsRadiusM,
          requireGpsValidation,
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

      return tx.particularClient.create({
        data: {
          name,
          taxId: emptyToNull(dto.taxId),
          address,
          contactName: emptyToNull(dto.contactName),
          email: emptyToNull(dto.email),
          phone: emptyToNull(dto.phone),
          notes: emptyToNull(dto.notes),
          isActive: true,
          buildingId: building.id,
        },
        select: CLIENT_SELECT,
      });
    });
  }

  async update(id: string, dto: UpdateParticularClientDto) {
    const existing = await this.assertExists(id);

    const requireGpsValidation =
      dto.requireGpsValidation !== undefined
        ? dto.requireGpsValidation
        : existing.building.requireGpsValidation;

    const nextLat =
      dto.latitude !== undefined ? dto.latitude : numberOrNull(existing.building.latitude);
    const nextLng =
      dto.longitude !== undefined ? dto.longitude : numberOrNull(existing.building.longitude);

    if (requireGpsValidation && (nextLat == null || nextLng == null)) {
      throw new BadRequestException('Seleccioná la ubicación del cliente en el mapa.');
    }

    return this.prisma.$transaction(async (tx) => {
      const name = dto.name !== undefined ? dto.name.trim() : undefined;
      const address =
        dto.address !== undefined ? emptyToNull(dto.address) : undefined;

      await tx.building.update({
        where: { id: existing.buildingId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(address !== undefined ? { address } : {}),
          ...(dto.city !== undefined ? { city: emptyToNull(dto.city) } : {}),
          ...(dto.province !== undefined ? { province: emptyToNull(dto.province) } : {}),
          ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
          ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
          ...(dto.gpsRadiusM !== undefined ? { gpsRadiusM: dto.gpsRadiusM } : {}),
          ...(dto.requireGpsValidation !== undefined
            ? { requireGpsValidation: dto.requireGpsValidation }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      return tx.particularClient.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(dto.taxId !== undefined ? { taxId: emptyToNull(dto.taxId) } : {}),
          ...(address !== undefined ? { address } : {}),
          ...(dto.contactName !== undefined
            ? { contactName: emptyToNull(dto.contactName) }
            : {}),
          ...(dto.email !== undefined ? { email: emptyToNull(dto.email) } : {}),
          ...(dto.phone !== undefined ? { phone: emptyToNull(dto.phone) } : {}),
          ...(dto.notes !== undefined ? { notes: emptyToNull(dto.notes) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        select: CLIENT_SELECT,
      });
    });
  }

  async remove(id: string) {
    const existing = await this.assertExists(id);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.particularClient.update({
        where: { id },
        data: { deletedAt: now, isActive: false },
      });
      await tx.building.update({
        where: { id: existing.buildingId },
        data: { deletedAt: now, isActive: false },
      });
    });

    return { message: 'Cliente particular eliminado' };
  }

  private async assertExists(id: string) {
    const client = await this.prisma.particularClient.findFirst({
      where: { id, deletedAt: null },
      select: CLIENT_SELECT,
    });
    if (!client) throw new NotFoundException('Cliente particular no encontrado');
    return client;
  }
}

function emptyToNull(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
