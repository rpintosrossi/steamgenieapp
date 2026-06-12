import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TaskFrequency, PeriodicTaskInstanceStatus, TaskExecutionStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MarkTaskDto } from '../service-executions/dto/mark-task.dto';
import { UploadPhotoDto } from '../service-executions/dto/upload-photo.dto';
import type { AuthUser } from '@steam-genie/shared-types';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { CreateFieldOptionDto } from './dto/create-field-option.dto';
import { UpdateFieldOptionDto } from './dto/update-field-option.dto';
import { DueTodayQueryDto } from './dto/due-today-query.dto';

/** Returns midnight UTC of the given date string, or today if omitted. */
function startOfDay(dateStr?: string): Date {
  const d = dateStr ? new Date(dateStr) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const TASK_SELECT = {
  id: true,
  buildingId: true,
  zoneId: true,
  subzoneId: true,
  name: true,
  frequency: true,
  startDate: true,
  requiresPhoto: true,
  allowsObservation: true,
  requiresRejectionReason: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ─── TASKS ─────────────────────────────────────────────────────────────────

  async findAll(query: QueryTasksDto) {
    const {
      page = 1, limit = 20,
      buildingId, zoneId, subzoneId, frequency, search, isActive,
      includeEventual = true,
    } = query;
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { deletedAt: null };

    if (buildingId) where.buildingId = buildingId;
    if (zoneId) where.zoneId = zoneId;
    if (subzoneId) where.subzoneId = subzoneId;
    if (frequency) where.frequency = frequency;
    if (isActive !== undefined) where.isActive = isActive;
    if (!includeEventual) where.frequency = { not: TaskFrequency.EVENTUAL };
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({ where, select: TASK_SELECT, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.task.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        customFields: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async create(dto: CreateTaskDto) {
    await this.validateHierarchy(dto.buildingId, dto.zoneId, dto.subzoneId);

    // Rule: if zone has active subzones, tasks must go in subzones
    if (!dto.subzoneId) {
      await this.assertNoActiveSubzones(dto.zoneId);
    }

    return this.prisma.task.create({
      data: {
        buildingId: dto.buildingId,
        zoneId: dto.zoneId,
        subzoneId: dto.subzoneId ?? null,
        name: dto.name,
        frequency: dto.frequency,
        startDate: startOfDay(dto.startDate),
        requiresPhoto: dto.requiresPhoto ?? false,
        allowsObservation: dto.allowsObservation ?? false,
        requiresRejectionReason: dto.requiresRejectionReason ?? false,
        isActive: dto.isActive ?? true,
      },
      select: TASK_SELECT,
    });
  }

  async update(id: string, dto: UpdateTaskDto) {
    const existing = await this.assertTaskExists(id);

    const newZoneId = (dto.zoneId ?? existing.zoneId) as string;
    const newSubzoneId = 'subzoneId' in dto ? dto.subzoneId : existing.subzoneId;

    if (dto.zoneId || 'subzoneId' in dto) {
      await this.validateHierarchy(existing.buildingId, newZoneId ?? existing.zoneId, newSubzoneId ?? undefined);
      if (!newSubzoneId) {
        await this.assertNoActiveSubzones(newZoneId ?? existing.zoneId);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.zoneId !== undefined) data.zoneId = dto.zoneId;
    if ('subzoneId' in dto) data.subzoneId = dto.subzoneId ?? null;
    if (dto.requiresPhoto !== undefined) data.requiresPhoto = dto.requiresPhoto;
    if (dto.allowsObservation !== undefined) data.allowsObservation = dto.allowsObservation;
    if (dto.requiresRejectionReason !== undefined) data.requiresRejectionReason = dto.requiresRejectionReason;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.task.update({ where: { id }, data, select: TASK_SELECT });
  }

  async remove(id: string) {
    await this.assertTaskExists(id);
    await this.prisma.task.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    return { message: 'Task deleted' };
  }

  // ─── CUSTOM FIELDS ─────────────────────────────────────────────────────────

  async createCustomField(taskId: string, dto: CreateCustomFieldDto) {
    await this.assertTaskExists(taskId);
    return this.prisma.taskCustomField.create({
      data: {
        taskId,
        label: dto.label,
        fieldType: dto.fieldType,
        isRequired: dto.isRequired ?? false,
        showInReport: dto.showInReport ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { options: true },
    });
  }

  async updateCustomField(id: string, dto: UpdateCustomFieldDto) {
    const field = await this.prisma.taskCustomField.findUnique({ where: { id } });
    if (!field) throw new NotFoundException('Custom field not found');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.isRequired !== undefined) data.isRequired = dto.isRequired;
    if (dto.showInReport !== undefined) data.showInReport = dto.showInReport;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    return this.prisma.taskCustomField.update({ where: { id }, data, include: { options: true } });
  }

  async removeCustomField(id: string) {
    const field = await this.prisma.taskCustomField.findUnique({ where: { id } });
    if (!field) throw new NotFoundException('Custom field not found');
    await this.prisma.taskCustomField.delete({ where: { id } });
    return { message: 'Custom field deleted' };
  }

  // ─── FIELD OPTIONS ─────────────────────────────────────────────────────────

  async createFieldOption(fieldId: string, dto: CreateFieldOptionDto) {
    const fieldRecord = await this.prisma.taskCustomField.findUnique({ where: { id: fieldId } });
    if (!fieldRecord) throw new NotFoundException('Custom field not found');

    return this.prisma.taskCustomFieldOption.create({
      data: { fieldId, label: dto.label, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async updateFieldOption(id: string, dto: UpdateFieldOptionDto) {
    const opt = await this.prisma.taskCustomFieldOption.findUnique({ where: { id } });
    if (!opt) throw new NotFoundException('Field option not found');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    return this.prisma.taskCustomFieldOption.update({ where: { id }, data });
  }

  async removeFieldOption(id: string) {
    const opt = await this.prisma.taskCustomFieldOption.findUnique({ where: { id } });
    if (!opt) throw new NotFoundException('Field option not found');
    await this.prisma.taskCustomFieldOption.delete({ where: { id } });
    return { message: 'Field option deleted' };
  }

  // ─── DUE TODAY ─────────────────────────────────────────────────────────────

  async getDueToday(query: DueTodayQueryDto) {
    const todayDate = startOfDay();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      deletedAt: null,
      isActive: true,
      frequency: { not: TaskFrequency.EVENTUAL },
      startDate: { lte: todayDate },
    };
    if (query.buildingId) where.buildingId = query.buildingId;
    if (query.zoneId) where.zoneId = query.zoneId;
    if (query.subzoneId) where.subzoneId = query.subzoneId;

    const tasks = await this.prisma.task.findMany({ where, select: TASK_SELECT });

    // Filter tasks that are actually due today based on frequency
    const dueTasks = tasks.filter((t) =>
      this.isTaskDueToday(t.frequency, t.startDate, todayDate),
    );

    // Upsert periodic_task_instances for each due task
    const instances = await Promise.all(
      dueTasks.map((task) => this.upsertPeriodicInstance(task, todayDate)),
    );

    return Promise.all(instances.map((instance) => this.enrichPeriodicInstance(instance)));
  }

  // ─── MARK PERIODIC INSTANCE ────────────────────────────────────────────────

  async markPeriodicInstance(instanceId: string, dto: MarkTaskDto, user: AuthUser) {
    const instance = await this.prisma.periodicTaskInstance.findUnique({
      where: { id: instanceId },
      include: { task: { select: { ...TASK_SELECT, deletedAt: true } } },
    });
    if (!instance || instance.task.deletedAt) {
      throw new NotFoundException('Periodic task instance not found');
    }

    await this.assertBuildingAccess(user.id, instance.task.buildingId);
    await this.assertActiveAttendance(user.id, instance.task.buildingId);

    if (dto.clientOperationId) {
      const existingByOp = await this.prisma.taskExecutionRecord.findUnique({
        where: { clientOperationId: dto.clientOperationId },
      });
      if (existingByOp) return existingByOp;
    }

    const existing = await this.prisma.taskExecutionRecord.findFirst({
      where: { periodicTaskInstanceId: instanceId },
    });

    if (
      dto.status === TaskExecutionStatus.NOT_DONE &&
      instance.task.requiresRejectionReason &&
      !dto.rejectionReasonId
    ) {
      throw new UnprocessableEntityException(
        `Task "${instance.task.name}" requires a rejection reason when marked as NOT_DONE.`,
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

    if (dto.observation && !instance.task.allowsObservation) {
      throw new UnprocessableEntityException(
        `Task "${instance.task.name}" does not allow observations.`,
      );
    }

    const executionData = {
      status: dto.status,
      rejectionReasonId:
        dto.status === TaskExecutionStatus.NOT_DONE ? (dto.rejectionReasonId ?? null) : null,
      observation: dto.observation ?? null,
      executedById: user.id,
      executedAt: new Date(),
      clientOperationId: dto.clientOperationId ?? null,
    };

    const record = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.taskExecutionRecord.update({
            where: { id: existing.id },
            data: {
              ...executionData,
              version: { increment: 1 },
            },
          })
        : await tx.taskExecutionRecord.create({
            data: {
              periodicTaskInstanceId: instanceId,
              ...executionData,
            },
          });

      await tx.periodicTaskInstance.update({
        where: { id: instanceId },
        data: {
          status: PeriodicTaskInstanceStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      return saved;
    });

    return record;
  }

  async uploadPeriodicPhoto(
    instanceId: string,
    file: Express.Multer.File,
    dto: UploadPhotoDto,
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

    const instance = await this.prisma.periodicTaskInstance.findUnique({
      where: { id: instanceId },
      include: { task: { select: { buildingId: true, name: true } } },
    });
    if (!instance) throw new NotFoundException('Periodic task instance not found');

    await this.assertBuildingAccess(user.id, instance.task.buildingId);
    await this.assertActiveAttendance(user.id, instance.task.buildingId);

    const taskExecution = await this.prisma.taskExecutionRecord.findFirst({
      where: { periodicTaskInstanceId: instanceId },
      select: { id: true },
    });
    if (!taskExecution) {
      throw new ConflictException(
        `Task "${instance.task.name}" must be marked before uploading photos.`,
      );
    }

    if (dto.clientOperationId) {
      const existing = await this.prisma.taskPhoto.findFirst({
        where: { clientOperationId: dto.clientOperationId },
      });
      if (existing) return this.formatPhoto(existing);
    }

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

  // ─── PRIVATE HELPERS ───────────────────────────────────────────────────────

  private isTaskDueToday(frequency: TaskFrequency, startDate: Date, today: Date): boolean {
    const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    if (today < start) return false;

    const dayOfWeek = today.getUTCDay(); // 0=Sun, 1=Mon...5=Fri, 6=Sat

    switch (frequency) {
      case TaskFrequency.DAILY:
        return true;

      case TaskFrequency.MON_FRI:
        return dayOfWeek >= 1 && dayOfWeek <= 5;

      case TaskFrequency.WEEKLY: {
        const startDay = start.getUTCDay();
        return dayOfWeek === startDay;
      }

      case TaskFrequency.BIWEEKLY: {
        const diffMs = today.getTime() - start.getTime();
        const diffDays = Math.floor(diffMs / 86400000);
        return diffDays % 14 === 0;
      }

      case TaskFrequency.MONTHLY:
        return today.getUTCMonth() >= start.getUTCMonth() || today.getUTCFullYear() > start.getUTCFullYear();

      case TaskFrequency.QUARTERLY:
      case TaskFrequency.BIANNUAL:
      case TaskFrequency.ANNUAL:
        return true; // Period-based — always show in current period if startDate passed

      default:
        return false;
    }
  }

  private getPeriodLabel(frequency: TaskFrequency, today: Date): string {
    const y = today.getUTCFullYear();
    const m = String(today.getUTCMonth() + 1).padStart(2, '0');
    const d = String(today.getUTCDate()).padStart(2, '0');

    switch (frequency) {
      case TaskFrequency.DAILY:
      case TaskFrequency.MON_FRI:
        return `${y}-${m}-${d}`;

      case TaskFrequency.WEEKLY: {
        const week = this.getISOWeek(today);
        return `${y}-W${String(week).padStart(2, '0')}`;
      }

      case TaskFrequency.BIWEEKLY: {
        // Biweek number from Jan 1: floor(dayOfYear / 14) + 1
        const startOfYear = new Date(Date.UTC(y, 0, 1));
        const dayOfYear = Math.floor((today.getTime() - startOfYear.getTime()) / 86400000);
        const bw = Math.floor(dayOfYear / 14) + 1;
        return `${y}-BW${String(bw).padStart(2, '0')}`;
      }

      case TaskFrequency.MONTHLY:
        return `${y}-${m}`;

      case TaskFrequency.QUARTERLY: {
        const q = Math.floor(today.getUTCMonth() / 3) + 1;
        return `${y}-Q${q}`;
      }

      case TaskFrequency.BIANNUAL:
        return today.getUTCMonth() < 6 ? `${y}-H1` : `${y}-H2`;

      case TaskFrequency.ANNUAL:
        return `${y}`;

      default:
        return `${y}-${m}-${d}`;
    }
  }

  private getPeriodBounds(frequency: TaskFrequency, today: Date): { start: Date; end: Date } {
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    const d = today.getUTCDate();

    switch (frequency) {
      case TaskFrequency.DAILY:
      case TaskFrequency.MON_FRI: {
        const day = new Date(Date.UTC(y, m, d));
        return { start: day, end: day };
      }

      case TaskFrequency.WEEKLY: {
        const dow = today.getUTCDay();
        const monday = new Date(Date.UTC(y, m, d - (dow === 0 ? 6 : dow - 1)));
        const sunday = new Date(Date.UTC(y, m, d + (dow === 0 ? 0 : 7 - dow)));
        return { start: monday, end: sunday };
      }

      case TaskFrequency.BIWEEKLY: {
        const startOfYear = new Date(Date.UTC(y, 0, 1));
        const dayOfYear = Math.floor((today.getTime() - startOfYear.getTime()) / 86400000);
        const bwStart = Math.floor(dayOfYear / 14) * 14;
        const start = new Date(Date.UTC(y, 0, 1 + bwStart));
        const end = new Date(Date.UTC(y, 0, 1 + bwStart + 13));
        return { start, end };
      }

      case TaskFrequency.MONTHLY: {
        const start = new Date(Date.UTC(y, m, 1));
        const end = new Date(Date.UTC(y, m + 1, 0));
        return { start, end };
      }

      case TaskFrequency.QUARTERLY: {
        const q = Math.floor(m / 3);
        const start = new Date(Date.UTC(y, q * 3, 1));
        const end = new Date(Date.UTC(y, q * 3 + 3, 0));
        return { start, end };
      }

      case TaskFrequency.BIANNUAL: {
        const half = m < 6 ? 0 : 1;
        const start = new Date(Date.UTC(y, half * 6, 1));
        const end = new Date(Date.UTC(y, half * 6 + 6, 0));
        return { start, end };
      }

      case TaskFrequency.ANNUAL: {
        const start = new Date(Date.UTC(y, 0, 1));
        const end = new Date(Date.UTC(y, 11, 31));
        return { start, end };
      }

      default: {
        const day = new Date(Date.UTC(y, m, d));
        return { start: day, end: day };
      }
    }
  }

  private getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private async upsertPeriodicInstance(
    task: { id: string; frequency: TaskFrequency; startDate: Date },
    today: Date,
  ) {
    const periodLabel = this.getPeriodLabel(task.frequency, today);
    const { start, end } = this.getPeriodBounds(task.frequency, today);

    const instance = await this.prisma.periodicTaskInstance.upsert({
      where: { taskId_periodLabel: { taskId: task.id, periodLabel } },
      create: {
        taskId: task.id,
        periodLabel,
        periodStart: start,
        periodEnd: end,
        status: PeriodicTaskInstanceStatus.PENDING,
      },
      update: {},
      include: {
        task: { select: TASK_SELECT },
      },
    });

    return instance;
  }

  private async validateHierarchy(
    buildingId: string,
    zoneId: string,
    subzoneId?: string,
  ) {
    const building = await this.prisma.building.findFirst({ where: { id: buildingId, deletedAt: null } });
    if (!building) throw new NotFoundException('Building not found or deleted');

    const zone = await this.prisma.zone.findFirst({ where: { id: zoneId, deletedAt: null } });
    if (!zone) throw new NotFoundException('Zone not found or deleted');
    if (zone.buildingId !== buildingId) {
      throw new BadRequestException('Zone does not belong to the specified building');
    }

    if (subzoneId) {
      const subzone = await this.prisma.subzone.findFirst({ where: { id: subzoneId, deletedAt: null } });
      if (!subzone) throw new NotFoundException('Subzone not found or deleted');
      if (subzone.zoneId !== zoneId) {
        throw new BadRequestException('Subzone does not belong to the specified zone');
      }
      if (subzone.buildingId !== buildingId) {
        throw new BadRequestException('Subzone does not belong to the specified building');
      }
    }
  }

  private async assertNoActiveSubzones(zoneId: string) {
    const count = await this.prisma.subzone.count({ where: { zoneId, deletedAt: null } });
    if (count > 0) {
      throw new BadRequestException(
        'This zone has active subzones. Tasks must be assigned to a subzone, not directly to the zone.',
      );
    }
  }

  private async assertTaskExists(id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async enrichPeriodicInstance(
    instance: Awaited<ReturnType<typeof this.upsertPeriodicInstance>>,
  ) {
    const execution = await this.prisma.taskExecutionRecord.findFirst({
      where: { periodicTaskInstanceId: instance.id },
      select: {
        id: true,
        status: true,
        observation: true,
        executedAt: true,
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
    });

    return {
      ...instance,
      execution: execution
        ? {
            id: execution.id,
            status: execution.status,
            observation: execution.observation,
            executedAt: execution.executedAt,
            photos: execution.photos.map((p) => this.formatPhoto(p)),
          }
        : null,
    };
  }

  private async assertBuildingAccess(userId: string, buildingId: string) {
    const access = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId,
        OR: [{ buildingId: null }, { buildingId }],
      },
    });
    if (!access) {
      throw new ForbiddenException('You do not have access to this building');
    }
  }

  private async assertActiveAttendance(userId: string, buildingId: string) {
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        userId,
        buildingId,
        checkOutAt: null,
        deletedAt: null,
      },
    });
    if (!attendance) {
      throw new ForbiddenException('You must be checked in to mark periodic tasks');
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
  ) {
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
}
