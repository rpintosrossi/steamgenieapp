import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import type { AuthUser } from '@steam-genie/shared-types';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── CHECK-IN ─────────────────────────────────────────────────────────────

  async checkIn(user: AuthUser, dto: CheckInDto, ip?: string) {
    const now = new Date();

    // GPS validation — must be inside building radius
    await this.assertInsideBuilding(dto.buildingId, dto.gpsLat, dto.gpsLng);

    // Idempotency for offline sync
    if (dto.clientOperationId) {
      const existing = await this.prisma.attendance.findUnique({
        where: { clientOperationId: dto.clientOperationId },
        select: { id: true },
      });
      if (existing) return this.findById(existing.id);
    }

    // Check for any open attendance for this user (across all buildings)
    const openAttendance = await this.prisma.attendance.findFirst({
      where: { userId: user.id, checkOutAt: null, deletedAt: null },
    });

    if (openAttendance) {
      if (openAttendance.buildingId === dto.buildingId) {
        throw new ConflictException('You already have an active check-in for this building');
      }
      // Open attendance in a different building — auto-close as forgotten checkout
      await this.prisma.attendance.update({
        where: { id: openAttendance.id },
        data: { checkOutAt: now, forgotCheckout: true },
      });
    }

    const attendance = await this.prisma.attendance.create({
      data: {
        userId: user.id,
        buildingId: dto.buildingId,
        checkInAt: now,
        checkInOccurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null,
        checkInGpsLat: dto.gpsLat,
        checkInGpsLng: dto.gpsLng,
        checkInDeviceId: dto.deviceId ?? null,
        checkInIp: ip ?? null,
        clientOperationId: dto.clientOperationId ?? null,
      },
    });

    return this.findById(attendance.id);
  }

  // ─── CHECK-OUT ────────────────────────────────────────────────────────────

  async checkOut(user: AuthUser, dto: CheckOutDto, ip?: string) {
    const now = new Date();

    const attendance = await this.prisma.attendance.findFirst({
      where: { userId: user.id, checkOutAt: null, deletedAt: null },
    });
    if (!attendance) {
      throw new NotFoundException('No active check-in found for this user');
    }

    // GPS validation — must be inside the building where the open check-in was recorded
    await this.assertInsideBuilding(attendance.buildingId, dto.gpsLat, dto.gpsLng);

    await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOutAt: now,
        checkOutOccurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null,
        checkOutGpsLat: dto.gpsLat,
        checkOutGpsLng: dto.gpsLng,
        checkOutDeviceId: dto.deviceId ?? null,
        checkOutIp: ip ?? null,
      },
    });

    return this.findById(attendance.id);
  }

  // ─── FIND ACTIVE ──────────────────────────────────────────────────────────

  async findActive(userId: string) {
    return this.prisma.attendance.findFirst({
      where: { userId, checkOutAt: null, deletedAt: null },
      include: {
        building: { select: { id: true, name: true } },
      },
    });
  }

  async findLast(userId: string) {
    return this.prisma.attendance.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { checkInAt: 'desc' },
      select: {
        id: true,
        checkInAt: true,
        checkOutAt: true,
        building: { select: { id: true, name: true } },
      },
    });
  }

  async findTodaySummary(userId: string) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const buildingSelect = {
      id: true,
      name: true,
      address: true,
      latitude: true,
      longitude: true,
      gpsRadiusM: true,
    } as const;

    const todayEntries = await this.prisma.attendance.findMany({
      where: {
        userId,
        deletedAt: null,
        checkInAt: { gte: start, lt: end },
      },
      orderBy: { checkInAt: 'desc' },
      select: {
        buildingId: true,
        checkInAt: true,
        checkOutAt: true,
        building: { select: buildingSelect },
      },
    });

    const activeEntry = todayEntries.find((entry) => entry.checkOutAt === null) ?? null;

    return {
      active: activeEntry
        ? {
            buildingId: activeEntry.buildingId,
            checkInAt: activeEntry.checkInAt,
            building: activeEntry.building,
          }
        : null,
      todayEntries,
    };
  }

  // ─── FIND ALL (admin/manager) ─────────────────────────────────────────────

  async findAll(query: QueryAttendanceDto) {
    const { page = 1, limit = 20, userId, buildingId, date } = query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { deletedAt: null };

    if (userId) where.userId = userId;
    if (buildingId) where.buildingId = buildingId;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setUTCDate(end.getUTCDate() + 1);
      where.checkInAt = { gte: start, lt: end };
    }

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { checkInAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, dni: true } },
          building: { select: { id: true, name: true } },
        },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── CORRECT (admin/manager) ──────────────────────────────────────────────

  async correct(id: string, dto: CorrectAttendanceDto, adminUser: AuthUser) {
    const attendance = await this.prisma.attendance.findFirst({
      where: { id, deletedAt: null },
    });
    if (!attendance) throw new NotFoundException('Attendance record not found');

    const hasRole = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: adminUser.id,
        role: { name: { in: ['admin', 'manager'] } },
        OR: [{ buildingId: null }, { buildingId: attendance.buildingId }],
      },
    });
    if (!hasRole) {
      throw new ForbiddenException(
        'You do not have permission to correct attendance records for this building',
      );
    }

    await this.prisma.attendance.update({
      where: { id },
      data: {
        ...(dto.checkInAt ? { checkInAt: new Date(dto.checkInAt) } : {}),
        ...(dto.checkOutAt ? { checkOutAt: new Date(dto.checkOutAt) } : {}),
        correctedById: adminUser.id,
        correctionNote: dto.correctionNote,
        version: { increment: 1 },
      },
    });

    return this.findById(id);
  }

  // ─── PRIVATE: GPS validation ──────────────────────────────────────────────

  /**
   * Loads the building's GPS center and radius, then validates that the given
   * coordinates are within the configured radius.
   * Throws if:
   *   - Building not found / inactive.
   *   - Building has no GPS coordinates configured.
   *   - User is outside the allowed radius.
   */
  private async assertInsideBuilding(
    buildingId: string,
    gpsLat: number,
    gpsLng: number,
  ) {
    if (process.env.SKIP_GPS_VALIDATION === 'true') {
      return;
    }

    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, isActive: true, deletedAt: null },
      select: { id: true, latitude: true, longitude: true, gpsRadiusM: true },
    });

    if (!building) throw new NotFoundException('Building not found');

    if (building.latitude == null || building.longitude == null) {
      throw new BadRequestException(
        'This building does not have GPS coordinates configured. Contact an administrator.',
      );
    }

    const distanceM = this.haversineDistanceM(
      Number(building.latitude),
      Number(building.longitude),
      gpsLat,
      gpsLng,
    );

    if (distanceM > building.gpsRadiusM) {
      throw new ForbiddenException(
        `You are ${Math.round(distanceM)}m away from "${building.id}" building. ` +
        `Maximum allowed radius: ${building.gpsRadiusM}m.`,
      );
    }
  }

  /** Haversine great-circle distance between two WGS-84 coordinates, in metres. */
  private haversineDistanceM(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6_371_000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lng2 - lng1);
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ─── PRIVATE: DB helpers ──────────────────────────────────────────────────

  private findById(id: string) {
    return this.prisma.attendance.findUniqueOrThrow({
      where: { id },
      include: {
        building: { select: { id: true, name: true } },
        user: { select: { id: true, fullName: true, dni: true } },
      },
    });
  }
}
