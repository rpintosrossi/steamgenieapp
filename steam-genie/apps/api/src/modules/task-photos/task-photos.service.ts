import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import type { AuthUser } from '@steam-genie/shared-types';

type PhotoKind = 'task' | 'service' | 'periodic';

@Injectable()
export class TaskPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ─── SOFT DELETE ──────────────────────────────────────────────────────────

  /**
   * Soft-delete a photo (task, service-execution phase, or periodic phase).
   * MVP policy: only admin or manager (global or building-scoped) can delete.
   */
  async softDelete(id: string, user: AuthUser) {
    const resolved = await this.resolvePhoto(id);
    if (!resolved) throw new NotFoundException('Photo not found');

    const hasRole = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: user.id,
        role: { name: { in: ['admin', 'manager'] } },
        OR: [{ buildingId: null }, { buildingId: resolved.buildingId }],
      },
    });
    if (!hasRole) {
      throw new ForbiddenException(
        'Only admin or manager can delete photos.',
      );
    }

    if (resolved.kind === 'task') {
      await this.prisma.taskPhoto.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id },
      });
    } else if (resolved.kind === 'service') {
      await this.prisma.serviceExecutionPhoto.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id },
      });
    } else {
      await this.prisma.periodicTaskInstancePhoto.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id },
      });
    }

    return { id, deleted: true };
  }

  // ─── SERVE LOCAL FILE ─────────────────────────────────────────────────────

  /**
   * Streams a locally stored photo by storage key (used in photo URLs).
   */
  async serveByKey(storageKey: string, res: Response) {
    const meta = await this.findMimeByStorageKey(storageKey);
    if (!meta) throw new NotFoundException('Photo not found');

    if (this.storage.usesObjectStorage && this.storage.hasPublicBaseUrl) {
      return res.redirect(this.storage.getPublicUrl(storageKey));
    }

    const stream = this.storage.getLocalStream(storageKey);
    if (!stream) throw new NotFoundException('File not found in local storage');

    res.setHeader('Content-Type', meta.mimeType ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.pipe(res);
  }

  /**
   * Streams a locally stored photo file to the response.
   * With object storage, redirects to the public URL.
   */
  async serveFile(photoId: string, res: Response) {
    const resolved = await this.resolvePhoto(photoId);
    if (!resolved) throw new NotFoundException('Photo not found');

    if (this.storage.usesObjectStorage && this.storage.hasPublicBaseUrl) {
      return res.redirect(this.storage.getPublicUrl(resolved.storageKey));
    }

    const stream = this.storage.getLocalStream(resolved.storageKey);
    if (!stream) throw new NotFoundException('File not found in local storage');

    res.setHeader('Content-Type', resolved.mimeType ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.pipe(res);
  }

  private async findMimeByStorageKey(
    storageKey: string,
  ): Promise<{ mimeType: string | null } | null> {
    const taskPhoto = await this.prisma.taskPhoto.findFirst({
      where: { storageKey, deletedAt: null },
      select: { mimeType: true },
    });
    if (taskPhoto) return taskPhoto;

    const servicePhoto = await this.prisma.serviceExecutionPhoto.findFirst({
      where: { storageKey, deletedAt: null },
      select: { mimeType: true },
    });
    if (servicePhoto) return servicePhoto;

    const periodicPhoto = await this.prisma.periodicTaskInstancePhoto.findFirst({
      where: { storageKey, deletedAt: null },
      select: { mimeType: true },
    });
    return periodicPhoto;
  }

  private async resolvePhoto(id: string): Promise<{
    kind: PhotoKind;
    buildingId: string | null;
    storageKey: string;
    mimeType: string | null;
  } | null> {
    const taskPhoto = await this.prisma.taskPhoto.findFirst({
      where: { id, deletedAt: null },
      include: {
        taskExecution: {
          include: {
            serviceExecution: {
              include: { workOrder: { select: { buildingId: true } } },
            },
            periodicTaskInstance: {
              include: { task: { select: { buildingId: true } } },
            },
          },
        },
      },
    });
    if (taskPhoto) {
      const buildingId =
        taskPhoto.taskExecution.serviceExecution?.workOrder.buildingId ??
        taskPhoto.taskExecution.periodicTaskInstance?.task.buildingId ??
        null;
      return {
        kind: 'task',
        buildingId,
        storageKey: taskPhoto.storageKey,
        mimeType: taskPhoto.mimeType,
      };
    }

    const servicePhoto = await this.prisma.serviceExecutionPhoto.findFirst({
      where: { id, deletedAt: null },
      include: {
        serviceExecution: {
          include: { workOrder: { select: { buildingId: true } } },
        },
      },
    });
    if (servicePhoto) {
      return {
        kind: 'service',
        buildingId: servicePhoto.serviceExecution.workOrder.buildingId,
        storageKey: servicePhoto.storageKey,
        mimeType: servicePhoto.mimeType,
      };
    }

    const periodicPhoto = await this.prisma.periodicTaskInstancePhoto.findFirst({
      where: { id, deletedAt: null },
      include: {
        periodicTaskInstance: {
          include: { task: { select: { buildingId: true } } },
        },
      },
    });
    if (periodicPhoto) {
      return {
        kind: 'periodic',
        buildingId: periodicPhoto.periodicTaskInstance.task.buildingId,
        storageKey: periodicPhoto.storageKey,
        mimeType: periodicPhoto.mimeType,
      };
    }

    return null;
  }
}
