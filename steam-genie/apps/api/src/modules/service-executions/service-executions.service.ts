import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { PhotoPhase, TaskExecutionStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MarkTaskDto } from './dto/mark-task.dto';
import { UploadPhotoDto } from './dto/upload-photo.dto';
import { UploadPhasePhotoDto } from './dto/upload-phase-photo.dto';
import type {
  PhasePhotoSummary,
  TaskExecutionItem,
  TaskPhotoSummary,
} from './dto/task-execution-item';
import type { AuthUser } from '@steam-genie/shared-types';
import {
  validateTaskFieldValues,
  upsertTaskFieldValues,
} from '../../common/task-field-values';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

@Injectable()
export class ServiceExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ─── GET TASKS ────────────────────────────────────────────────────────────
  // IMPORTANT: task marking uses workOrderTaskId (snapshot), never taskId directly.

  async getTasksForExecution(
    serviceExecutionId: string,
    user: AuthUser,
  ): Promise<TaskExecutionItem[]> {
    const se = await this.findServiceExecution(serviceExecutionId);
    await this.assertIsParticipantOrManager(se, user);

    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id: se.workOrderId },
      select: { zoneId: true, subzoneId: true },
    });

    const workOrderTasks = await this.prisma.workOrderTask.findMany({
      where: { workOrderId: se.workOrderId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        nameSnapshot: true,
        sortOrder: true,
        requiresPhotoSnapshot: true,
        allowsObservationSnapshot: true,
        requiresRejectionReasonSnapshot: true,
        customFieldSnapshots: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            labelSnapshot: true,
            fieldType: true,
            isRequired: true,
            showInReport: true,
            sortOrder: true,
            optionSnapshots: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, labelSnapshot: true, sortOrder: true },
            },
          },
        },
        task: { select: { zoneId: true, subzoneId: true } },
        taskExecutions: {
          where: { serviceExecutionId },
          select: {
            id: true,
            status: true,
            executedById: true,
            executedBy: { select: { fullName: true } },
            executedAt: true,
            observation: true,
            fieldValues: {
              select: {
                snapshotFieldId: true,
                selectedOptionIds: true,
              },
            },
            photos: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                storageKey: true,
                originalFilename: true,
                mimeType: true,
                fileSizeBytes: true,
                capturedAt: true,
                uploadedAt: true,
              },
            },
          },
        },
      },
    });

    return workOrderTasks.map((wot) => {
      const exec = wot.taskExecutions[0] ?? null;
      return {
        workOrderTaskId: wot.id,
        nameSnapshot: wot.nameSnapshot,
        sortOrder: wot.sortOrder,
        requiresPhotoSnapshot: wot.requiresPhotoSnapshot,
        allowsObservationSnapshot: wot.allowsObservationSnapshot,
        requiresRejectionReasonSnapshot: wot.requiresRejectionReasonSnapshot,
        zoneId: wot.task?.zoneId ?? workOrder?.zoneId ?? null,
        subzoneId: wot.task?.subzoneId ?? workOrder?.subzoneId ?? null,
        customFields: wot.customFieldSnapshots.map((field) => ({
          id: field.id,
          label: field.labelSnapshot,
          fieldType: field.fieldType,
          isRequired: field.isRequired,
          showInReport: field.showInReport,
          sortOrder: field.sortOrder,
          options: field.optionSnapshots.map((option) => ({
            id: option.id,
            label: option.labelSnapshot,
            sortOrder: option.sortOrder,
          })),
        })),
        execution: exec
          ? {
              id: exec.id,
              status: exec.status,
              executedById: exec.executedById,
              executedByName: exec.executedBy.fullName,
              executedAt: exec.executedAt,
              observation: exec.observation,
              photoCount: exec.photos.length,
              photos: exec.photos.map((p) => this.formatPhoto(p)),
              fieldValues: exec.fieldValues
                .filter((value) => value.snapshotFieldId)
                .map((value) => ({
                  fieldId: value.snapshotFieldId!,
                  selectedOptionIds: value.selectedOptionIds,
                })),
            }
          : null,
      };
    });
  }

  // ─── MARK TASK ────────────────────────────────────────────────────────────

  async markTask(
    serviceExecutionId: string,
    workOrderTaskId: string,
    dto: MarkTaskDto,
    user: AuthUser,
  ) {
    const se = await this.findServiceExecution(serviceExecutionId);

    if (se.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        `Service execution is not in progress (current status: ${se.status})`,
      );
    }

    await this.assertIsParticipantOrManager(se, user);

    if (dto.clientOperationId) {
      const existingByOp = await this.prisma.taskExecutionRecord.findUnique({
        where: { clientOperationId: dto.clientOperationId },
      });
      if (existingByOp) return existingByOp;
    }

    const wot = await this.prisma.workOrderTask.findFirst({
      where: { id: workOrderTaskId, workOrderId: se.workOrderId },
      select: {
        id: true,
        nameSnapshot: true,
        requiresRejectionReasonSnapshot: true,
        allowsObservationSnapshot: true,
        customFieldSnapshots: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            labelSnapshot: true,
            isRequired: true,
            optionSnapshots: { select: { id: true, labelSnapshot: true } },
          },
        },
      },
    });
    if (!wot) {
      throw new NotFoundException('Work order task not found for this service execution');
    }

    const existing = await this.prisma.taskExecutionRecord.findUnique({
      where: {
        serviceExecutionId_workOrderTaskId: { serviceExecutionId, workOrderTaskId },
      },
    });

    if (
      dto.status === TaskExecutionStatus.NOT_DONE &&
      wot.requiresRejectionReasonSnapshot &&
      !dto.rejectionReasonId
    ) {
      throw new UnprocessableEntityException(
        `Task "${wot.nameSnapshot}" requires a rejection reason when marked as NOT_DONE.`,
      );
    }

    if (dto.rejectionReasonId) {
      const reason = await this.prisma.rejectionReason.findFirst({
        where: { id: dto.rejectionReasonId, type: 'TASK_NOT_DONE', isActive: true },
      });
      if (!reason) {
        throw new NotFoundException(
          'Rejection reason not found or not valid for task execution (must be type TASK_NOT_DONE)',
        );
      }
    }

    if (dto.observation && !wot.allowsObservationSnapshot) {
      throw new UnprocessableEntityException(
        `Task "${wot.nameSnapshot}" does not allow observations.`,
      );
    }

    const fieldDefinitions = wot.customFieldSnapshots.map((field) => ({
      id: field.id,
      label: field.labelSnapshot,
      isRequired: field.isRequired,
      options: field.optionSnapshots.map((option) => ({
        id: option.id,
        label: option.labelSnapshot,
      })),
    }));
    validateTaskFieldValues(fieldDefinitions, dto.fieldValues, dto.status);

    const executionData = {
      status: dto.status,
      rejectionReasonId:
        dto.status === TaskExecutionStatus.NOT_DONE ? (dto.rejectionReasonId ?? null) : null,
      observation: dto.observation ?? null,
      executedById: user.id,
      executedAt: new Date(),
      clientOperationId: dto.clientOperationId ?? null,
    };

    if (existing) {
      return this.prisma.$transaction(async (tx) => {
        const record = await tx.taskExecutionRecord.update({
          where: { id: existing.id },
          data: {
            ...executionData,
            version: { increment: 1 },
          },
        });
        await upsertTaskFieldValues(tx, record.id, dto.fieldValues, 'snapshot');
        return record;
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.taskExecutionRecord.create({
        data: {
          serviceExecutionId,
          workOrderTaskId,
          ...executionData,
        },
      });
      await upsertTaskFieldValues(tx, record.id, dto.fieldValues, 'snapshot');
      return record;
    });
  }

  // ─── UPLOAD PHOTO ─────────────────────────────────────────────────────────

  async uploadPhoto(
    serviceExecutionId: string,
    workOrderTaskId: string,
    file: Express.Multer.File,
    dto: UploadPhotoDto,
    user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Photo file is required (field: photo)');

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 8 MB.`,
      );
    }

    const se = await this.findServiceExecution(serviceExecutionId);

    if (se.status !== 'IN_PROGRESS') {
      throw new ConflictException('Service execution is not in progress');
    }

    await this.assertIsParticipantOrManager(se, user);

    // Verify workOrderTask belongs to this SE's work order
    const wot = await this.prisma.workOrderTask.findFirst({
      where: { id: workOrderTaskId, workOrderId: se.workOrderId },
      select: { id: true, nameSnapshot: true },
    });
    if (!wot) throw new NotFoundException('Work order task not found for this service execution');

    // Task must be marked before uploading photos
    const taskExecution = await this.prisma.taskExecutionRecord.findUnique({
      where: {
        serviceExecutionId_workOrderTaskId: { serviceExecutionId, workOrderTaskId },
      },
      select: { id: true },
    });
    if (!taskExecution) {
      throw new ConflictException(
        `Task "${wot.nameSnapshot}" must be marked (DONE/NOT_DONE/SKIPPED) before uploading photos.`,
      );
    }

    // Idempotency: if clientOperationId already uploaded, return existing
    if (dto.clientOperationId) {
      const existing = await this.prisma.taskPhoto.findFirst({
        where: { clientOperationId: dto.clientOperationId },
      });
      if (existing) return this.formatPhoto(existing);
    }

    // Generate unique key and upload
    const key = this.storage.generateKey(file.originalname, file.mimetype);
    await this.storage.upload(key, file.buffer, file.mimetype);

    const photo = await this.prisma.taskPhoto.create({
      data: {
        taskExecutionId: taskExecution.id,
        storageKey: key,
        storageBucket: this.storage.storageBucketName,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : null,
        gpsLat: dto.gpsLat ?? null,
        gpsLng: dto.gpsLng ?? null,
        deviceId: dto.deviceId ?? null,
        clientOperationId: dto.clientOperationId ?? null,
        uploadedById: user.id,
      },
    });

    return this.formatPhoto(photo);
  }

  // ─── GET PHOTOS FOR TASK ──────────────────────────────────────────────────

  async getPhotosForTask(
    serviceExecutionId: string,
    workOrderTaskId: string,
    user: AuthUser,
  ): Promise<TaskPhotoSummary[]> {
    const se = await this.findServiceExecution(serviceExecutionId);
    await this.assertIsParticipantOrManager(se, user);

    const taskExecution = await this.prisma.taskExecutionRecord.findUnique({
      where: {
        serviceExecutionId_workOrderTaskId: { serviceExecutionId, workOrderTaskId },
      },
      select: { id: true },
    });

    if (!taskExecution) return [];

    const photos = await this.prisma.taskPhoto.findMany({
      where: { taskExecutionId: taskExecution.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    return photos.map((p) => this.formatPhoto(p));
  }

  // ─── PHASE PHOTOS (BEFORE / DURING / AFTER) ───────────────────────────────

  async uploadPhasePhoto(
    serviceExecutionId: string,
    file: Express.Multer.File,
    dto: UploadPhasePhotoDto,
    user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Photo file is required (field: photo)');

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 8 MB.`,
      );
    }

    if (!Object.values(PhotoPhase).includes(dto.phase)) {
      throw new BadRequestException(`Invalid phase "${dto.phase}"`);
    }

    const se = await this.findServiceExecution(serviceExecutionId);

    if (se.status !== 'IN_PROGRESS') {
      throw new ConflictException('Service execution is not in progress');
    }

    await this.assertIsParticipantOrManager(se, user);

    if (dto.clientOperationId) {
      const existing = await this.prisma.serviceExecutionPhoto.findFirst({
        where: { clientOperationId: dto.clientOperationId },
      });
      if (existing) return this.formatPhasePhoto(existing);
    }

    const key = this.storage.generateKey(file.originalname, file.mimetype);
    await this.storage.upload(key, file.buffer, file.mimetype);

    const photo = await this.prisma.serviceExecutionPhoto.create({
      data: {
        serviceExecutionId,
        phase: dto.phase,
        storageKey: key,
        storageBucket: this.storage.storageBucketName,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : null,
        gpsLat: dto.gpsLat ?? null,
        gpsLng: dto.gpsLng ?? null,
        deviceId: dto.deviceId ?? null,
        clientOperationId: dto.clientOperationId ?? null,
        uploadedById: user.id,
      },
    });

    return this.formatPhasePhoto(photo);
  }

  async getPhasePhotos(
    serviceExecutionId: string,
    user: AuthUser,
  ): Promise<PhasePhotoSummary[]> {
    const se = await this.findServiceExecution(serviceExecutionId);
    await this.assertIsParticipantOrManager(se, user);

    const photos = await this.prisma.serviceExecutionPhoto.findMany({
      where: { serviceExecutionId, deletedAt: null },
      orderBy: [{ phase: 'asc' }, { createdAt: 'asc' }],
    });

    return photos.map((p) => this.formatPhasePhoto(p));
  }

  async deletePhasePhoto(
    serviceExecutionId: string,
    photoId: string,
    user: AuthUser,
  ) {
    const se = await this.findServiceExecution(serviceExecutionId);

    if (se.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        'Solo se pueden eliminar fotos mientras el servicio está en progreso',
      );
    }

    await this.assertIsParticipantOrManager(se, user);

    const photo = await this.prisma.serviceExecutionPhoto.findFirst({
      where: {
        id: photoId,
        serviceExecutionId,
        deletedAt: null,
      },
    });
    if (!photo) throw new NotFoundException('Foto no encontrada');

    await this.prisma.serviceExecutionPhoto.update({
      where: { id: photo.id },
      data: {
        deletedAt: new Date(),
        deletedBy: user.id,
      },
    });

    try {
      await this.storage.delete(photo.storageKey);
    } catch {
      // Soft delete ya aplicado; el archivo puede limpiarse después.
    }

    return { ok: true as const, id: photo.id };
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  private async findServiceExecution(id: string) {
    const se = await this.prisma.serviceExecution.findFirst({
      where: { id },
      select: {
        id: true,
        workOrderId: true,
        status: true,
        workOrder: { select: { buildingId: true } },
        participants: { select: { userId: true } },
      },
    });
    if (!se) throw new NotFoundException('Service execution not found');
    return se;
  }

  private async assertIsParticipantOrManager(
    se: {
      workOrder: { buildingId: string };
      participants: { userId: string }[];
    },
    user: AuthUser,
  ) {
    const isParticipant = se.participants.some((p) => p.userId === user.id);
    if (isParticipant) return;

    const hasManagerRole = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: user.id,
        role: { name: { in: ['admin', 'manager'] } },
        OR: [
          { buildingId: null },
          { buildingId: se.workOrder.buildingId },
        ],
      },
    });
    if (!hasManagerRole) {
      throw new ForbiddenException(
        'You must be a participant in this execution or have a manager/admin role to access it',
      );
    }
  }

  private formatPhoto(
    p: {
      id: string;
      storageKey: string;
      originalFilename?: string | null;
      mimeType?: string | null;
      fileSizeBytes?: number | null;
      capturedAt?: Date | null;
      uploadedAt: Date;
    },
  ): TaskPhotoSummary {
    return {
      id: p.id,
      storageKey: p.storageKey,
      url: this.storage.getPublicUrl(p.storageKey),
      originalFilename: p.originalFilename ?? null,
      mimeType: p.mimeType ?? null,
      fileSizeBytes: p.fileSizeBytes ?? null,
      capturedAt: p.capturedAt ?? null,
      uploadedAt: p.uploadedAt,
    };
  }

  private formatPhasePhoto(
    p: {
      id: string;
      phase: PhotoPhase;
      storageKey: string;
      originalFilename?: string | null;
      mimeType?: string | null;
      fileSizeBytes?: number | null;
      capturedAt?: Date | null;
      uploadedAt: Date;
    },
  ): PhasePhotoSummary {
    return {
      ...this.formatPhoto(p),
      phase: p.phase,
    };
  }
}
