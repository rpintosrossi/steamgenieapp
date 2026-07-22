import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  TaskFrequency,
  PeriodicTaskInstanceStatus,
  TaskExecutionStatus,
  BuildingMode,
  PhotoEvidenceMode,
  PhotoPhase,
} from '@prisma/client';
import { resolvePhotoEvidenceMode } from '../../common/building-mode';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MarkTaskDto } from '../service-executions/dto/mark-task.dto';
import { UploadPhotoDto } from '../service-executions/dto/upload-photo.dto';
import { UploadPhasePhotoDto } from '../service-executions/dto/upload-phase-photo.dto';
import type { AuthUser } from '@steam-genie/shared-types';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateTaskCategoryDto } from './dto/create-task-category.dto';
import { UpdateTaskCategoryDto } from './dto/update-task-category.dto';
import { QueryTaskCategoriesDto } from './dto/query-task-categories.dto';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { CreateFieldOptionDto } from './dto/create-field-option.dto';
import { UpdateFieldOptionDto } from './dto/update-field-option.dto';
import { DueTodayQueryDto } from './dto/due-today-query.dto';
import { QueryRecurringWorkDto } from './dto/query-recurring-work.dto';
import type { RecurringWorkDisplayStatus } from './dto/query-recurring-work.dto';
import { QueryRecurringWorkGroupsDto } from './dto/query-recurring-work-groups.dto';
import { QueryRecurringWorkGroupTasksDto } from './dto/query-recurring-work-group-tasks.dto';
import {
  groupRecurringWorkRows,
  matchesRecurringWorkLocation,
} from './recurring-work-groups.util';
import { TimelineEventsService } from '../../common/events/timeline-events.service';
import { calendarDateKeyInBusinessTz, TASK_CATEGORY_UNCATEGORIZED } from '@steam-genie/shared-constants';
import {
  validateTaskFieldValues,
  upsertTaskFieldValues,
} from '../../common/task-field-values';

/** Returns midnight UTC of the given date string, or today if omitted. */
function startOfDay(dateStr?: string): Date {
  const d = dateStr ? new Date(dateStr) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const TASK_CATEGORY_SELECT = {
  id: true,
  name: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

const TASK_SELECT = {
  id: true,
  buildingId: true,
  zoneId: true,
  subzoneId: true,
  categoryId: true,
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

const TASK_LIST_SELECT = {
  ...TASK_SELECT,
  category: { select: { id: true, name: true } },
  building: { select: { id: true, name: true, buildingMode: true, photoEvidenceMode: true } },
  zone: {
    select: {
      id: true,
      name: true,
      floor: { select: { id: true, name: true } },
    },
  },
  subzone: { select: { id: true, name: true } },
};

const PHASE_PHOTO_LABELS: Record<PhotoPhase, string> = {
  BEFORE: 'antes',
  DURING: 'durante',
  AFTER: 'después',
};

const TASK_CUSTOM_FIELDS_SELECT = {
  orderBy: { sortOrder: 'asc' as const },
  select: {
    id: true,
    label: true,
    fieldType: true,
    isRequired: true,
    showInReport: true,
    sortOrder: true,
    options: {
      orderBy: { sortOrder: 'asc' as const },
      select: { id: true, label: true, sortOrder: true },
    },
  },
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
    private readonly timelineEvents: TimelineEventsService,
  ) {}

  // ─── TASKS ─────────────────────────────────────────────────────────────────

  async findAll(query: QueryTasksDto, user?: AuthUser) {
    const {
      page = 1, limit = 20,
      buildingId, zoneId, subzoneId, frequency, search, isActive,
      includeEventual = true,
    } = query;
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { deletedAt: null };

    if (user?.primaryRole === 'client') {
      const assignments = await this.prisma.userBuildingRole.findMany({
        where: { userId: user.id, buildingId: { not: null } },
        select: { buildingId: true },
      });
      const scopedBuildingIds = [
        ...new Set(
          assignments
            .map((item) => item.buildingId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (scopedBuildingIds.length === 0) {
        return { data: [], total: 0, page, limit, pages: 0 };
      }
      if (buildingId) {
        if (!scopedBuildingIds.includes(buildingId)) {
          return { data: [], total: 0, page, limit, pages: 0 };
        }
        where.buildingId = buildingId;
      } else {
        where.buildingId = { in: scopedBuildingIds };
      }
    } else if (buildingId) {
      where.buildingId = buildingId;
    }

    if (zoneId) where.zoneId = zoneId;
    if (subzoneId) where.subzoneId = subzoneId;
    if (frequency) where.frequency = frequency;
    if (isActive !== undefined) where.isActive = isActive;
    if (!includeEventual) where.frequency = { not: TaskFrequency.EVENTUAL };
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        select: TASK_LIST_SELECT,
        skip,
        take: limit,
        orderBy: [{ frequency: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.task.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, user?: AuthUser) {
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        customFields: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
        category: { select: { id: true, name: true } },
        building: { select: { id: true, name: true } },
        zone: {
          select: {
            id: true,
            name: true,
            floor: { select: { id: true, name: true } },
          },
        },
        subzone: { select: { id: true, name: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');

    if (user?.primaryRole === 'client') {
      const hasAccess = await this.prisma.userBuildingRole.findFirst({
        where: { userId: user.id, buildingId: task.buildingId },
      });
      if (!hasAccess) {
        throw new ForbiddenException('No tenés acceso a tareas de este edificio.');
      }
    }

    return task;
  }

  async create(dto: CreateTaskDto) {
    await this.validateHierarchy(dto.buildingId, dto.zoneId, dto.subzoneId);

    // Rule: if zone has active subzones, tasks must go in subzones
    if (!dto.subzoneId) {
      await this.assertNoActiveSubzones(dto.zoneId);
    }

    const categoryId =
      dto.frequency === TaskFrequency.EVENTUAL ? (dto.categoryId ?? null) : null;
    if (dto.categoryId && dto.frequency !== TaskFrequency.EVENTUAL) {
      throw new BadRequestException(
        'La categoría solo se puede asignar a tareas con frecuencia Eventual.',
      );
    }
    if (categoryId) {
      await this.assertCategoryExists(categoryId);
    }

    return this.prisma.task.create({
      data: {
        buildingId: dto.buildingId,
        zoneId: dto.zoneId,
        subzoneId: dto.subzoneId ?? null,
        categoryId,
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

    if ('categoryId' in dto && dto.categoryId) {
      if (existing.frequency !== TaskFrequency.EVENTUAL) {
        throw new BadRequestException(
          'La categoría solo se puede asignar a tareas con frecuencia Eventual.',
        );
      }
      await this.assertCategoryExists(dto.categoryId);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.zoneId !== undefined) data.zoneId = dto.zoneId;
    if ('subzoneId' in dto) data.subzoneId = dto.subzoneId ?? null;
    if ('categoryId' in dto) {
      data.categoryId =
        existing.frequency === TaskFrequency.EVENTUAL ? (dto.categoryId ?? null) : null;
    }
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

  /**
   * Hard-delete de TODAS las tareas y dependencias (ejecuciones, snapshots WO,
   * instancias periódicas, campos custom). Los work orders quedan sin checklist.
   */
  async purgeAll(confirm: string) {
    if (confirm !== 'DELETE_ALL_TASKS') {
      throw new BadRequestException(
        'Confirmación inválida. Enviá confirm=DELETE_ALL_TASKS para vaciar todas las tareas.',
      );
    }

    const deleted = await this.prisma.$transaction(
      async (tx) => {
        const totalBefore = await tx.task.count();

        // 1) Ejecuciones (fotos → valores → registros)
        await tx.taskPhoto.deleteMany({});
        await tx.taskExecutionFieldValue.deleteMany({});
        await tx.taskExecutionRecord.deleteMany({});

        // 2) Snapshots de tareas en servicios eventuales
        await tx.workOrderTaskCustomFieldOption.deleteMany({});
        await tx.workOrderTaskCustomField.deleteMany({});
        await tx.workOrderTask.deleteMany({});

        // 3) Instancias periódicas
        await tx.periodicTaskInstance.deleteMany({});

        // 4) Campos custom del maestro
        await tx.taskCustomFieldOption.deleteMany({});
        await tx.taskCustomField.deleteMany({});

        // 5) Tareas
        const result = await tx.task.deleteMany({});

        return { totalBefore, deletedTasks: result.count };
      },
      { timeout: 180_000 },
    );

    return {
      message: 'All tasks purged',
      ...deleted,
    };
  }

  // ─── CATEGORIES ────────────────────────────────────────────────────────────

  async findAllCategories(query: QueryTaskCategoriesDto) {
    const includeInactive = query.includeInactive === true;

    if (query.forEventualService && query.buildingId && query.zoneId) {
      return this.findCategoriesForEventualService(query.buildingId, query.zoneId);
    }

    return this.prisma.taskCategory.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        ...TASK_CATEGORY_SELECT,
        _count: { select: { tasks: { where: { deletedAt: null, frequency: TaskFrequency.EVENTUAL } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Categorías usadas por tareas EVENTUAL activas de la zona (y subzonas),
   * más la opción sintética "Sin categoría" si hay tareas sin categoría.
   */
  async findCategoriesForEventualService(buildingId: string, zoneId: string) {
    const subzones = await this.prisma.subzone.findMany({
      where: { zoneId, buildingId, deletedAt: null },
      select: { id: true },
    });
    const subzoneIds = subzones.map((s) => s.id);
    const locationOr = [
      { subzoneId: null },
      ...(subzoneIds.length > 0 ? [{ subzoneId: { in: subzoneIds } }] : []),
    ];

    const eventualWhere = {
      buildingId,
      zoneId,
      frequency: TaskFrequency.EVENTUAL,
      isActive: true,
      deletedAt: null,
      OR: locationOr,
    };

    const [categorized, uncategorizedCount] = await Promise.all([
      this.prisma.task.findMany({
        where: { ...eventualWhere, categoryId: { not: null } },
        select: { categoryId: true },
        distinct: ['categoryId'],
      }),
      this.prisma.task.count({
        where: { ...eventualWhere, categoryId: null },
      }),
    ]);

    const categoryIds = categorized
      .map((t) => t.categoryId)
      .filter((id): id is string => Boolean(id));

    const categories =
      categoryIds.length > 0
        ? await this.prisma.taskCategory.findMany({
            where: {
              id: { in: categoryIds },
              deletedAt: null,
              isActive: true,
            },
            select: {
              ...TASK_CATEGORY_SELECT,
              _count: {
                select: {
                  tasks: {
                    where: {
                      ...eventualWhere,
                    },
                  },
                },
              },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          })
        : [];

    const result = [...categories];

    if (uncategorizedCount > 0) {
      result.unshift({
        id: TASK_CATEGORY_UNCATEGORIZED,
        name: 'Sin categoría',
        sortOrder: -1,
        isActive: true,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        _count: { tasks: uncategorizedCount },
      });
    }

    return result;
  }

  async createCategory(dto: CreateTaskCategoryDto) {
    const name = dto.name.trim();
    await this.assertCategoryNameAvailable(name);

    return this.prisma.taskCategory.create({
      data: {
        name,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      },
      select: TASK_CATEGORY_SELECT,
    });
  }

  async updateCategory(id: string, dto: UpdateTaskCategoryDto) {
    const existing = await this.assertCategoryExists(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== existing.name) {
        await this.assertCategoryNameAvailable(name, id);
      }
    }

    return this.prisma.taskCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: TASK_CATEGORY_SELECT,
    });
  }

  async removeCategory(id: string) {
    await this.assertCategoryExists(id);

    const taskCount = await this.prisma.task.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (taskCount > 0) {
      throw new ConflictException(
        'No se puede eliminar una categoría con tareas asignadas.',
      );
    }

    await this.prisma.taskCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Categoría eliminada' };
  }

  private async assertCategoryExists(id: string) {
    const category = await this.prisma.taskCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }

  private async assertCategoryNameAvailable(name: string, excludeId?: string) {
    const duplicate = await this.prisma.taskCategory.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException('Ya existe una categoría con ese nombre.');
    }
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

    const instances = await this.loadPeriodicInstances(dueTasks, todayDate, {
      createMissing: true,
    });
    return this.enrichPeriodicInstancesBatch(instances);
  }

  // ─── RECURRING WORK LIST (ADMIN) ───────────────────────────────────────────

  async listRecurringWork(query: QueryRecurringWorkDto, user: AuthUser) {
    const { page = 1, limit = 20, buildingId, status, search, periodDate } = query;
    const rows = await this.buildRecurringWorkRows(
      { buildingId, search, periodDate, status },
      user,
      { includeExecution: true, includePhotos: true, includeFieldValues: true },
    );

    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const data = rows.slice((page - 1) * limit, page * limit);

    return { data, total, page, limit, pages };
  }

  async listRecurringWorkGroups(query: QueryRecurringWorkGroupsDto, user: AuthUser) {
    const { page = 1, limit = 20, buildingId, groupStatus, search, periodDate } = query;
    const rows = await this.buildRecurringWorkRows(
      { buildingId, search, periodDate },
      user,
      { includeExecution: false },
    );

    let groups = groupRecurringWorkRows(rows);
    if (groupStatus) {
      groups = groups.filter((group) => group.aggregateStatus === groupStatus);
    }

    const total = groups.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const data = groups.slice((page - 1) * limit, page * limit);

    return { data, total, page, limit, pages };
  }

  async listRecurringWorkGroupTasks(
    query: QueryRecurringWorkGroupTasksDto,
    user: AuthUser,
  ) {
    const {
      page = 1,
      limit = 20,
      buildingId,
      floorId,
      zoneId,
      subzoneId,
      search,
      periodDate,
    } = query;

    const rows = await this.buildRecurringWorkRows(
      { buildingId, search, periodDate },
      user,
      { includeExecution: true, includePhotos: true, includeFieldValues: false },
    );

    const locationRows = rows
      .filter((row) =>
        matchesRecurringWorkLocation(row, { buildingId, floorId, zoneId, subzoneId }),
      )
      .sort((a, b) => a.taskName.localeCompare(b.taskName, 'es'));

    const total = locationRows.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const data = locationRows.slice((page - 1) * limit, page * limit);

    return { data, total, page, limit, pages };
  }

  private async buildRecurringWorkRows(
    filters: {
      buildingId?: string;
      search?: string;
      periodDate?: string;
      status?: RecurringWorkDisplayStatus;
    },
    user: AuthUser,
    enrichOptions: {
      includeExecution?: boolean;
      includePhotos?: boolean;
      includeFieldValues?: boolean;
    } = {},
  ) {
    const { buildingId, search, periodDate, status } = filters;
    const refDate = startOfDay(periodDate);
    const today = startOfDay();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskWhere: any = {
      deletedAt: null,
      isActive: true,
      frequency: { not: TaskFrequency.EVENTUAL },
      startDate: { lte: refDate },
    };

    const allowedBuildingIds = await this.getAllowedBuildingIds(user, buildingId);
    if (allowedBuildingIds !== null) {
      if (allowedBuildingIds.length === 0) {
        return [];
      }
      taskWhere.buildingId = { in: allowedBuildingIds };
    }

    if (search?.trim()) {
      taskWhere.name = { contains: search.trim(), mode: 'insensitive' };
    }

    const tasks = await this.prisma.task.findMany({
      where: taskWhere,
      select: TASK_LIST_SELECT,
      orderBy: [{ building: { name: 'asc' } }, { name: 'asc' }],
    });

    const instances = await this.loadPeriodicInstances(
      tasks.map((task) => ({
        id: task.id,
        frequency: task.frequency,
        startDate: task.startDate,
      })),
      refDate,
      { createMissing: false },
    );
    const enriched = await this.enrichPeriodicInstancesBatch(instances, enrichOptions);
    const rows = tasks.map((task, index) => {
      const instance = enriched[index];
      const displayStatus = this.computeRecurringDisplayStatus(instance, today);
      return this.formatRecurringWorkRow(task, instance, displayStatus);
    });

    return status ? rows.filter((row) => row.displayStatus === status) : rows;
  }

  // ─── MARK PERIODIC INSTANCE ────────────────────────────────────────────────

  async markPeriodicInstance(instanceId: string, dto: MarkTaskDto, user: AuthUser) {
    const instance = await this.prisma.periodicTaskInstance.findUnique({
      where: { id: instanceId },
      include: {
        task: {
          select: {
            ...TASK_SELECT,
            deletedAt: true,
            customFields: TASK_CUSTOM_FIELDS_SELECT,
          },
        },
      },
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

    const building = await this.prisma.building.findFirst({
      where: { id: instance.task.buildingId, deletedAt: null },
      select: { buildingMode: true, photoEvidenceMode: true },
    });
    const photoEvidenceMode = resolvePhotoEvidenceMode(building);

    if (
      dto.status === TaskExecutionStatus.DONE &&
      photoEvidenceMode === PhotoEvidenceMode.BEFORE_DURING_AFTER
    ) {
      await this.assertPeriodicPhasePhotosComplete(instanceId);
    }

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

    const fieldDefinitions = instance.task.customFields.map((field) => ({
      id: field.id,
      label: field.label,
      isRequired: field.isRequired,
      options: field.options.map((option) => ({
        id: option.id,
        label: option.label,
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

      await upsertTaskFieldValues(tx, saved.id, dto.fieldValues, 'master');

      await tx.periodicTaskInstance.update({
        where: { id: instanceId },
        data: {
          status: PeriodicTaskInstanceStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      return saved;
    });

    // Fire event for the timeline live stream (fire-and-forget, best-effort)
    try {
      // Load the rejection reason label (if any) — the transactional `record`
      // only has the FK, but the SSE consumer needs the human-readable text.
      const rejectionReasonRow =
        record.rejectionReasonId
          ? await this.prisma.rejectionReason.findUnique({
              where: { id: record.rejectionReasonId },
              select: { id: true, text: true },
            })
          : null;
      const rejectionReason = rejectionReasonRow
        ? { id: rejectionReasonRow.id, reason: rejectionReasonRow.text }
        : null;

      this.timelineEvents.emit({
        type: 'PERIODIC_INSTANCE_MARKED',
        buildingId: instance.task.buildingId,
        date: calendarDateKeyInBusinessTz(new Date()),
        instanceId,
        taskId: instance.taskId,
        instanceStatus: PeriodicTaskInstanceStatus.COMPLETED,
        execution: {
          id: record.id,
          status: record.status,
          executedAt: record.executedAt.toISOString(),
          executedBy: {
            id: user.id,
            fullName: user.fullName,
            dni: user.dni,
          },
          observation: record.observation,
          rejectionReason,
        },
      });
    } catch {
      // ignore event bus errors
    }

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

  async uploadPeriodicPhasePhoto(
    instanceId: string,
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

    const instance = await this.prisma.periodicTaskInstance.findUnique({
      where: { id: instanceId },
      include: { task: { select: { buildingId: true, name: true } } },
    });
    if (!instance) throw new NotFoundException('Periodic task instance not found');

    await this.assertBuildingAccess(user.id, instance.task.buildingId);
    await this.assertActiveAttendance(user.id, instance.task.buildingId);

    if (dto.clientOperationId) {
      const existing = await this.prisma.periodicTaskInstancePhoto.findFirst({
        where: { clientOperationId: dto.clientOperationId },
      });
      if (existing) return this.formatPhasePhoto(existing);
    }

    const key = this.storage.generateKey(file.originalname, file.mimetype);
    await this.storage.upload(key, file.buffer, file.mimetype);

    const photo = await this.prisma.periodicTaskInstancePhoto.create({
      data: {
        periodicTaskInstanceId: instanceId,
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

  async getPeriodicPhasePhotos(instanceId: string, user: AuthUser) {
    const instance = await this.prisma.periodicTaskInstance.findUnique({
      where: { id: instanceId },
      include: { task: { select: { buildingId: true } } },
    });
    if (!instance) throw new NotFoundException('Periodic task instance not found');

    await this.assertBuildingAccess(user.id, instance.task.buildingId);

    const photos = await this.prisma.periodicTaskInstancePhoto.findMany({
      where: { periodicTaskInstanceId: instanceId, deletedAt: null },
      orderBy: [{ phase: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        phase: true,
        storageKey: true,
        originalFilename: true,
        mimeType: true,
        fileSizeBytes: true,
        capturedAt: true,
        uploadedAt: true,
        uploadedBy: { select: { id: true, fullName: true } },
      },
    });

    return photos.map((p) => this.formatPhasePhoto(p));
  }

  async deletePeriodicPhasePhoto(
    instanceId: string,
    photoId: string,
    user: AuthUser,
  ) {
    const instance = await this.prisma.periodicTaskInstance.findUnique({
      where: { id: instanceId },
      include: { task: { select: { buildingId: true } } },
    });
    if (!instance) throw new NotFoundException('Periodic task instance not found');

    await this.assertBuildingAccess(user.id, instance.task.buildingId);
    await this.assertActiveAttendance(user.id, instance.task.buildingId);

    const photo = await this.prisma.periodicTaskInstancePhoto.findFirst({
      where: {
        id: photoId,
        periodicTaskInstanceId: instanceId,
        deletedAt: null,
      },
    });
    if (!photo) throw new NotFoundException('Foto no encontrada');

    await this.prisma.periodicTaskInstancePhoto.update({
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

  // ─── PRIVATE HELPERS ───────────────────────────────────────────────────────

  private async assertPeriodicPhasePhotosComplete(instanceId: string) {
    const phasePhotos = await this.prisma.periodicTaskInstancePhoto.findMany({
      where: { periodicTaskInstanceId: instanceId, deletedAt: null },
      select: { phase: true },
    });
    const phasesPresent = new Set(phasePhotos.map((p) => p.phase));
    const missingPhases = (
      [PhotoPhase.BEFORE, PhotoPhase.DURING, PhotoPhase.AFTER] as const
    ).filter((phase) => !phasesPresent.has(phase));
    if (missingPhases.length > 0) {
      throw new ConflictException(
        `Faltan fotos de evidencia: ${missingPhases.map((p) => PHASE_PHOTO_LABELS[p]).join(', ')}. ` +
          'Se requiere al menos una foto en cada fase (antes, durante y después).',
      );
    }
  }

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

  private buildPeriodSpec(task: { id: string; frequency: TaskFrequency }, refDate: Date) {
    const periodLabel = this.getPeriodLabel(task.frequency, refDate);
    const { start, end } = this.getPeriodBounds(task.frequency, refDate);
    return {
      taskId: task.id,
      periodLabel,
      periodStart: start,
      periodEnd: end,
    };
  }

  private async loadPeriodicInstances(
    tasks: Array<{ id: string; frequency: TaskFrequency; startDate: Date }>,
    refDate: Date,
    options: { createMissing: boolean },
  ) {
    if (tasks.length === 0) return [];

    const specs = tasks.map((task) => ({
      task,
      ...this.buildPeriodSpec(task, refDate),
    }));

    const existing = await this.prisma.periodicTaskInstance.findMany({
      where: {
        OR: specs.map((spec) => ({
          taskId: spec.taskId,
          periodLabel: spec.periodLabel,
        })),
      },
    });

    const existingMap = new Map(
      existing.map((instance) => [`${instance.taskId}:${instance.periodLabel}`, instance]),
    );

    if (options.createMissing) {
      const missing = specs.filter(
        (spec) => !existingMap.has(`${spec.taskId}:${spec.periodLabel}`),
      );

      if (missing.length > 0) {
        await this.prisma.periodicTaskInstance.createMany({
          data: missing.map((spec) => ({
            taskId: spec.taskId,
            periodLabel: spec.periodLabel,
            periodStart: spec.periodStart,
            periodEnd: spec.periodEnd,
            status: PeriodicTaskInstanceStatus.PENDING,
          })),
          skipDuplicates: true,
        });
      }

      const persisted = await this.prisma.periodicTaskInstance.findMany({
        where: {
          OR: specs.map((spec) => ({
            taskId: spec.taskId,
            periodLabel: spec.periodLabel,
          })),
        },
        include: { task: { select: { ...TASK_SELECT, customFields: TASK_CUSTOM_FIELDS_SELECT } } },
      });

      const persistedMap = new Map(
        persisted.map((instance) => [`${instance.taskId}:${instance.periodLabel}`, instance]),
      );

      return specs.map((spec) => {
        const instance = persistedMap.get(`${spec.taskId}:${spec.periodLabel}`);
        if (!instance) {
          throw new Error(`Failed to ensure periodic instance for task ${spec.taskId}`);
        }
        return instance;
      });
    }

    return specs.map((spec) => {
      const instance = existingMap.get(`${spec.taskId}:${spec.periodLabel}`);
      if (instance) return instance;

      return {
        id: `virtual:${spec.taskId}:${spec.periodLabel}`,
        taskId: spec.taskId,
        periodLabel: spec.periodLabel,
        periodStart: spec.periodStart,
        periodEnd: spec.periodEnd,
        status: PeriodicTaskInstanceStatus.PENDING,
        completedAt: null,
        createdAt: refDate,
        updatedAt: refDate,
      };
    });
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

  private async enrichPeriodicInstancesBatch<
    T extends {
      id: string;
      taskId: string;
      periodLabel: string;
      periodStart: Date;
      periodEnd: Date;
      status: PeriodicTaskInstanceStatus;
      completedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
  >(
    instances: T[],
    options?: {
      includeExecution?: boolean;
      includePhotos?: boolean;
      includeFieldValues?: boolean;
    },
  ) {
    if (instances.length === 0) return [];

    const {
      includeExecution = true,
      includePhotos = true,
      includeFieldValues = true,
    } = options ?? {};

    if (!includeExecution) {
      return instances.map((instance) => ({ ...instance, execution: null }));
    }

    const realIds = instances
      .map((instance) => instance.id)
      .filter((id) => !id.startsWith('virtual:'));

    const executionSelect = {
      id: true,
      periodicTaskInstanceId: true,
      status: true,
      observation: true,
      executedAt: true,
      executedBy: { select: { id: true, fullName: true, dni: true } },
      ...(includeFieldValues
        ? {
            fieldValues: {
              select: {
                masterFieldId: true,
                selectedOptionIds: true,
              },
            },
          }
        : {}),
      ...(includePhotos
        ? {
            photos: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'asc' as const },
              select: {
                id: true,
                storageKey: true,
                originalFilename: true,
                mimeType: true,
                fileSizeBytes: true,
                capturedAt: true,
                uploadedAt: true,
                uploadedBy: { select: { id: true, fullName: true } },
              },
            },
          }
        : {}),
    };

    const executions =
      realIds.length === 0
        ? []
        : await this.prisma.taskExecutionRecord.findMany({
            where: { periodicTaskInstanceId: { in: realIds } },
            select: executionSelect,
          });

    const executionByInstanceId = new Map(
      executions.map((execution) => [execution.periodicTaskInstanceId!, execution]),
    );

    const phasePhotos =
      includePhotos && realIds.length > 0
        ? await this.prisma.periodicTaskInstancePhoto.findMany({
            where: { periodicTaskInstanceId: { in: realIds }, deletedAt: null },
            orderBy: [{ phase: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              periodicTaskInstanceId: true,
              phase: true,
              storageKey: true,
              originalFilename: true,
              mimeType: true,
              fileSizeBytes: true,
              capturedAt: true,
              uploadedAt: true,
              uploadedBy: { select: { id: true, fullName: true } },
            },
          })
        : [];

    const phasePhotosByInstanceId = new Map<string, typeof phasePhotos>();
    for (const photo of phasePhotos) {
      const list = phasePhotosByInstanceId.get(photo.periodicTaskInstanceId) ?? [];
      list.push(photo);
      phasePhotosByInstanceId.set(photo.periodicTaskInstanceId, list);
    }

    return instances.map((instance) => {
      const execution = executionByInstanceId.get(instance.id);
      const instancePhasePhotos = includePhotos
        ? (phasePhotosByInstanceId.get(instance.id) ?? []).map((photo) =>
            this.formatPhasePhoto(photo),
          )
        : [];
      return {
        ...instance,
        phasePhotos: instancePhasePhotos,
        execution: execution
          ? {
              id: execution.id,
              status: execution.status,
              observation: execution.observation,
              executedAt: execution.executedAt,
              executedBy: execution.executedBy,
              photos: includePhotos
                ? (execution.photos ?? []).map((photo) => this.formatPhoto(photo))
                : [],
              fieldValues: includeFieldValues
                ? (execution.fieldValues ?? [])
                    .filter((value) => value.masterFieldId)
                    .map((value) => ({
                      fieldId: value.masterFieldId!,
                      selectedOptionIds: value.selectedOptionIds,
                    }))
                : [],
            }
          : null,
      };
    });
  }

  private computeRecurringDisplayStatus(
    instance: {
      status: PeriodicTaskInstanceStatus;
      periodEnd: Date;
    },
    today: Date,
  ): RecurringWorkDisplayStatus {
    if (instance.status === PeriodicTaskInstanceStatus.COMPLETED) {
      return 'COMPLETED';
    }
    if (instance.status === PeriodicTaskInstanceStatus.EXPIRED) {
      return 'OVERDUE';
    }

    const periodEnd = new Date(
      Date.UTC(
        instance.periodEnd.getUTCFullYear(),
        instance.periodEnd.getUTCMonth(),
        instance.periodEnd.getUTCDate(),
      ),
    );
    if (periodEnd < today) {
      return 'OVERDUE';
    }

    return 'SCHEDULED';
  }

  private formatRecurringWorkRow(
    task: {
      id: string;
      name: string;
      frequency: TaskFrequency;
      requiresPhoto: boolean;
      building: {
        id: string;
        name: string;
        buildingMode?: BuildingMode;
        photoEvidenceMode?: PhotoEvidenceMode;
      } | null;
      zone: {
        id: string;
        name: string;
        floor: { id: string; name: string } | null;
      } | null;
      subzone: { id: string; name: string } | null;
    },
    instance: {
      id: string;
      periodLabel: string;
      periodStart: Date;
      periodEnd: Date;
      status: PeriodicTaskInstanceStatus;
      completedAt: Date | null;
      phasePhotos?: ReturnType<TasksService['formatPhasePhoto']>[];
      execution: {
        id: string;
        status: TaskExecutionStatus;
        observation: string | null;
        executedAt: Date;
        executedBy: { id: string; fullName: string; dni: string };
        photos: ReturnType<TasksService['formatPhoto']>[];
      } | null;
    },
    displayStatus: RecurringWorkDisplayStatus,
  ) {
    const periodStart = instance.periodStart;
    const periodEnd = instance.periodEnd;
    const sameDay =
      periodStart.getUTCFullYear() === periodEnd.getUTCFullYear() &&
      periodStart.getUTCMonth() === periodEnd.getUTCMonth() &&
      periodStart.getUTCDate() === periodEnd.getUTCDate();

    const fmt = (d: Date) =>
      d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      });

    const floor = task.zone?.floor ?? null;
    const zone = task.zone ? { id: task.zone.id, name: task.zone.name } : null;

    return {
      id: instance.id,
      taskId: task.id,
      taskName: task.name,
      frequency: task.frequency,
      requiresPhoto: task.requiresPhoto,
      photoEvidenceMode: resolvePhotoEvidenceMode(task.building),
      building: task.building
        ? { id: task.building.id, name: task.building.name }
        : null,
      floor,
      zone,
      subzone: task.subzone,
      periodLabel: instance.periodLabel,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      periodLabelDisplay: sameDay ? fmt(periodStart) : `${fmt(periodStart)} – ${fmt(periodEnd)}`,
      displayStatus,
      instanceStatus: instance.status,
      completedAt: instance.completedAt?.toISOString() ?? null,
      phasePhotos: instance.phasePhotos ?? [],
      execution: instance.execution,
    };
  }

  private async getAllowedBuildingIds(
    user: AuthUser,
    buildingId?: string,
  ): Promise<string[] | null> {
    const globalStaff = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: user.id,
        buildingId: null,
        role: { name: { in: ['admin', 'manager'] } },
      },
    });
    if (globalStaff) {
      return buildingId ? [buildingId] : null;
    }

    if (user.primaryRole === 'client') {
      const clientAssignments = await this.prisma.userBuildingRole.findMany({
        where: { userId: user.id, buildingId: { not: null } },
        select: { buildingId: true },
      });
      const clientIds = [
        ...new Set(
          clientAssignments
            .map((item) => item.buildingId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (buildingId) {
        return clientIds.includes(buildingId) ? [buildingId] : [];
      }
      return clientIds;
    }

    const assignments = await this.prisma.userBuildingRole.findMany({
      where: {
        userId: user.id,
        buildingId: { not: null },
        role: { name: { in: ['admin', 'manager'] } },
      },
      select: { buildingId: true },
    });

    const ids = [
      ...new Set(
        assignments
          .map((item) => item.buildingId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (buildingId) {
      return ids.includes(buildingId) ? [buildingId] : [];
    }

    return ids;
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
      uploadedBy?: { id: string; fullName: string } | null;
    },
  ) {
    return {
      id: p.id,
      storageKey: p.storageKey,
      url: this.storage.getPublicUrl(p.storageKey),
      originalFilename: p.originalFilename ?? null,
      mimeType: p.mimeType ?? null,
      fileSizeBytes: p.fileSizeBytes ?? null,
      capturedAt: p.capturedAt?.toISOString() ?? null,
      uploadedAt: p.uploadedAt.toISOString(),
      uploadedBy: p.uploadedBy ?? null,
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
      uploadedBy?: { id: string; fullName: string } | null;
    },
  ) {
    return {
      ...this.formatPhoto(p),
      phase: p.phase,
    };
  }
}
