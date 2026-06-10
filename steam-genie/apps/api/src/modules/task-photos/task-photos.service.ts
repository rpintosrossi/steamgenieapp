import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import type { AuthUser } from '@steam-genie/shared-types';

@Injectable()
export class TaskPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ─── SOFT DELETE ──────────────────────────────────────────────────────────

  /**
   * Soft-delete a TaskPhoto.
   * MVP policy: only admin or manager (global or building-scoped) can delete.
   * Cleaners cannot delete photos after upload.
   */
  async softDelete(id: string, user: AuthUser) {
    const photo = await this.prisma.taskPhoto.findFirst({
      where: { id, deletedAt: null },
      include: {
        taskExecution: {
          include: {
            serviceExecution: {
              include: { workOrder: { select: { buildingId: true } } },
            },
          },
        },
      },
    });
    if (!photo) throw new NotFoundException('Photo not found');

    const buildingId =
      photo.taskExecution.serviceExecution?.workOrder.buildingId ?? null;

    const hasRole = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: user.id,
        role: { name: { in: ['admin', 'manager'] } },
        OR: [{ buildingId: null }, { buildingId }],
      },
    });
    if (!hasRole) {
      throw new ForbiddenException(
        'Only admin or manager can delete photos.',
      );
    }

    await this.prisma.taskPhoto.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: user.id },
    });

    return { id, deleted: true };
  }

  // ─── SERVE LOCAL FILE ─────────────────────────────────────────────────────

  /**
   * Streams a locally stored photo file to the response.
   * Used only when S3/R2 is not configured (local filesystem backend).
   * Access requires authentication — the route is guarded by JwtAuthGuard.
   */
  async serveFile(photoId: string, res: Response) {
    const photo = await this.prisma.taskPhoto.findFirst({
      where: { id: photoId, deletedAt: null },
      select: { storageKey: true, mimeType: true },
    });
    if (!photo) throw new NotFoundException('Photo not found');

    const stream = this.storage.getLocalStream(photo.storageKey);
    if (!stream) throw new NotFoundException('File not found in local storage');

    res.setHeader('Content-Type', photo.mimeType ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.pipe(res);
  }
}
