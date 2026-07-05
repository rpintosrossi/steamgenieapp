import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { BuildingReportQueryDto } from './dto/building-report-query.dto';
import { DateReportQueryDto } from './dto/date-report-query.dto';
import { WorkerReportQueryDto } from './dto/worker-report-query.dto';
import type { AuthUser } from '@steam-genie/shared-types';
import { calendarDateKeyInBusinessTz } from '@steam-genie/shared-constants';
import {
  assertBuildingAccess,
  buildingIdFilter,
  MAX_REPORT_INPUT_ROWS,
  MAX_REPORT_PAGE_SIZE,
  paginateArray,
  parseReportDateRange,
  resolveAccessibleBuildingIds,
} from './helpers/report-query.helpers';
import {
  attendanceDurationMs,
  mapMasterReportFields,
  mapSnapshotReportFields,
} from './helpers/report-fields.helper';

type ZoneRef = {
  zoneId: string;
  zoneName: string;
  floorId: string | null;
  floorName: string | null;
  buildingId: string;
  buildingName: string;
};

type DateReportRow = {
  date: string;
  worker: { id: string; fullName: string };
  buildings: Array<{ id: string; name: string }>;
  cleanedZones: ZoneRef[];
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDateReport(query: DateReportQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, MAX_REPORT_PAGE_SIZE);
    const { dateFrom, endExclusive } = parseReportDateRange(query.dateFrom, query.dateTo);
    const buildingIds = await resolveAccessibleBuildingIds(
      this.prisma,
      user.id,
      query.buildingId,
    );
    const buildingFilter = buildingIdFilter(buildingIds);

    const rows = new Map<string, DateReportRow>();

    const ensureRow = (
      dateKey: string,
      workerId: string,
      workerName: string,
    ): DateReportRow => {
      const key = `${dateKey}|${workerId}`;
      let row = rows.get(key);
      if (!row) {
        row = {
          date: dateKey,
          worker: { id: workerId, fullName: workerName },
          buildings: [],
          cleanedZones: [],
        };
        rows.set(key, row);
      }
      return row;
    };

    const addBuilding = (row: DateReportRow, id: string, name: string) => {
      if (!row.buildings.some((b) => b.id === id)) {
        row.buildings.push({ id, name });
      }
    };

    const addZone = (row: DateReportRow, zone: ZoneRef) => {
      if (
        !row.cleanedZones.some(
          (z) => z.zoneId === zone.zoneId && z.buildingId === zone.buildingId,
        )
      ) {
        row.cleanedZones.push(zone);
      }
    };

    const [attendanceCount, attendances] = await Promise.all([
      this.prisma.attendance.count({
        where: {
          deletedAt: null,
          checkInAt: { gte: dateFrom, lt: endExclusive },
          buildingId: buildingFilter,
          ...(query.userId ? { userId: query.userId } : {}),
        },
      }),
      this.prisma.attendance.findMany({
        where: {
          deletedAt: null,
          checkInAt: { gte: dateFrom, lt: endExclusive },
          buildingId: buildingFilter,
          ...(query.userId ? { userId: query.userId } : {}),
        },
        select: {
          checkInAt: true,
          userId: true,
          user: { select: { id: true, fullName: true, deletedAt: true } },
          building: { select: { id: true, name: true, deletedAt: true } },
        },
        orderBy: { checkInAt: 'asc' },
        take: MAX_REPORT_INPUT_ROWS,
      }),
    ]);

    if (attendanceCount > MAX_REPORT_INPUT_ROWS) {
      throw new BadRequestException(
        'Demasiados registros para el rango seleccionado. Acotá fechas, edificio o trabajador.',
      );
    }

    for (const att of attendances) {
      if (att.user.deletedAt || att.building.deletedAt) continue;
      const dateKey = calendarDateKeyInBusinessTz(att.checkInAt);
      const row = ensureRow(dateKey, att.userId, att.user.fullName);
      addBuilding(row, att.building.id, att.building.name);
    }

    const woParticipants = await this.prisma.serviceExecutionParticipant.findMany({
      where: {
        ...(query.userId ? { userId: query.userId } : {}),
        attendance: { deletedAt: null, buildingId: buildingFilter },
        serviceExecution: {
          status: 'COMPLETED',
          completedAt: { gte: dateFrom, lt: endExclusive },
          workOrder: {
            deletedAt: null,
            status: 'COMPLETED',
            zoneId: { not: null },
            buildingId: buildingFilter,
          },
        },
      },
      select: {
        userId: true,
        user: { select: { id: true, fullName: true, deletedAt: true } },
        serviceExecution: {
          select: {
            completedAt: true,
            workOrder: {
              select: {
                buildingId: true,
                floorId: true,
                zoneId: true,
                building: { select: { id: true, name: true, deletedAt: true } },
                floor: { select: { id: true, name: true, deletedAt: true } },
                zone: { select: { id: true, name: true, deletedAt: true } },
              },
            },
          },
        },
      },
      take: MAX_REPORT_INPUT_ROWS,
    });

    for (const part of woParticipants) {
      if (part.user.deletedAt) continue;
      const wo = part.serviceExecution.workOrder;
      if (!wo.zoneId || !wo.zone || wo.building.deletedAt) continue;
      const completedAt = part.serviceExecution.completedAt;
      if (!completedAt) continue;
      const dateKey = calendarDateKeyInBusinessTz(completedAt);
      const row = ensureRow(dateKey, part.userId, part.user.fullName);
      addBuilding(row, wo.building.id, wo.building.name);
      addZone(row, {
        zoneId: wo.zoneId,
        zoneName: wo.zone.name,
        floorId: wo.floorId,
        floorName: wo.floor?.name ?? null,
        buildingId: wo.buildingId,
        buildingName: wo.building.name,
      });
    }

    const periodicExecutions = await this.prisma.taskExecutionRecord.findMany({
      where: {
        status: 'DONE',
        executedAt: { gte: dateFrom, lt: endExclusive },
        ...(query.userId ? { executedById: query.userId } : {}),
        periodicTaskInstanceId: { not: null },
        periodicTaskInstance: {
          task: {
            deletedAt: null,
            zoneId: { not: null },
            buildingId: buildingFilter,
          },
        },
      },
      select: {
        executedAt: true,
        executedById: true,
        executedBy: { select: { id: true, fullName: true, deletedAt: true } },
        periodicTaskInstance: {
          select: {
            task: {
              select: {
                buildingId: true,
                zoneId: true,
                building: { select: { id: true, name: true, deletedAt: true } },
                zone: {
                  select: {
                    id: true,
                    name: true,
                    deletedAt: true,
                    floor: { select: { id: true, name: true, deletedAt: true } },
                  },
                },
              },
            },
          },
        },
      },
      take: MAX_REPORT_INPUT_ROWS,
    });

    for (const exec of periodicExecutions) {
      if (exec.executedBy.deletedAt) continue;
      const task = exec.periodicTaskInstance?.task;
      if (!task?.zoneId || !task.zone || task.building.deletedAt) continue;
      const dateKey = calendarDateKeyInBusinessTz(exec.executedAt);
      const row = ensureRow(dateKey, exec.executedById, exec.executedBy.fullName);
      addBuilding(row, task.building.id, task.building.name);
      addZone(row, {
        zoneId: task.zoneId,
        zoneName: task.zone.name,
        floorId: task.zone.floor?.id ?? null,
        floorName: task.zone.floor?.name ?? null,
        buildingId: task.buildingId,
        buildingName: task.building.name,
      });
    }

    const sorted = [...rows.values()].sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return a.worker.fullName.localeCompare(b.worker.fullName, 'es');
    });

    for (const row of sorted) {
      row.buildings.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      row.cleanedZones.sort((a, b) => {
        const buildingCmp = a.buildingName.localeCompare(b.buildingName, 'es');
        if (buildingCmp !== 0) return buildingCmp;
        const floorA = a.floorName ?? '';
        const floorB = b.floorName ?? '';
        const floorCmp = floorA.localeCompare(floorB, 'es');
        if (floorCmp !== 0) return floorCmp;
        return a.zoneName.localeCompare(b.zoneName, 'es');
      });
    }

    const paged = paginateArray(sorted, page, limit);

    return {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      buildingId: query.buildingId ?? null,
      userId: query.userId ?? null,
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      pages: paged.pages,
    };
  }

  async getWorkerReport(query: WorkerReportQueryDto, user: AuthUser) {
    const { dateFrom, endExclusive } = parseReportDateRange(query.dateFrom, query.dateTo);

    const targetUser = await this.prisma.user.findFirst({
      where: { id: query.userId, deletedAt: null, isActive: true },
      select: { id: true, fullName: true },
    });
    if (!targetUser) {
      throw new NotFoundException('Trabajador no encontrado.');
    }

    const buildingIds = await resolveAccessibleBuildingIds(this.prisma, user.id);

    const attendances = await this.prisma.attendance.findMany({
      where: {
        deletedAt: null,
        userId: query.userId,
        checkInAt: { gte: dateFrom, lt: endExclusive },
        buildingId: buildingIdFilter(buildingIds),
      },
      select: {
        id: true,
        checkInAt: true,
        checkOutAt: true,
        building: { select: { id: true, name: true, deletedAt: true } },
      },
      orderBy: { checkInAt: 'asc' },
    });

    let totalClockedMs = 0;
    const attendanceDurations = new Map<string, number>();
    for (const att of attendances) {
      if (att.building.deletedAt) continue;
      const ms = attendanceDurationMs(att.checkInAt, att.checkOutAt);
      totalClockedMs += ms;
      attendanceDurations.set(att.id, ms);
    }

    type ZoneEntry = ZoneRef & { durationMs: number | null; source: 'service' | 'periodic' };
    const zoneMap = new Map<string, ZoneEntry>();
    let attributedServiceMs = 0;

    const addServiceZoneTime = (
      attendanceId: string,
      zone: ZoneRef,
      durationMs: number,
    ) => {
      if (!attendanceDurations.has(attendanceId)) return;
      attributedServiceMs += durationMs;
      const key = `${zone.buildingId}|${zone.zoneId}`;
      const existing = zoneMap.get(key);
      if (existing) {
        existing.durationMs = (existing.durationMs ?? 0) + durationMs;
      } else {
        zoneMap.set(key, { ...zone, durationMs, source: 'service' });
      }
    };

    const participants = await this.prisma.serviceExecutionParticipant.findMany({
      where: {
        userId: query.userId,
        attendance: {
          deletedAt: null,
          userId: query.userId,
          checkInAt: { gte: dateFrom, lt: endExclusive },
          buildingId: buildingIdFilter(buildingIds),
        },
        serviceExecution: {
          status: 'COMPLETED',
          completedAt: { not: null },
          workOrder: {
            deletedAt: null,
            status: 'COMPLETED',
            zoneId: { not: null },
            buildingId: buildingIdFilter(buildingIds),
          },
        },
      },
      select: {
        attendanceId: true,
        serviceExecution: {
          select: {
            startedAt: true,
            completedAt: true,
            workOrder: {
              select: {
                buildingId: true,
                floorId: true,
                zoneId: true,
                building: { select: { id: true, name: true, deletedAt: true } },
                floor: { select: { id: true, name: true } },
                zone: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    for (const part of participants) {
      const se = part.serviceExecution;
      const wo = se.workOrder;
      if (!wo.zoneId || !wo.zone || wo.building.deletedAt || !se.completedAt) continue;
      const durationMs = Math.max(0, se.completedAt.getTime() - se.startedAt.getTime());
      addServiceZoneTime(
        part.attendanceId,
        {
          zoneId: wo.zoneId,
          zoneName: wo.zone.name,
          floorId: wo.floorId,
          floorName: wo.floor?.name ?? null,
          buildingId: wo.buildingId,
          buildingName: wo.building.name,
        },
        durationMs,
      );
    }

    const periodicDone = await this.prisma.taskExecutionRecord.findMany({
      where: {
        status: 'DONE',
        executedById: query.userId,
        executedAt: { gte: dateFrom, lt: endExclusive },
        periodicTaskInstanceId: { not: null },
        periodicTaskInstance: {
          task: {
            deletedAt: null,
            zoneId: { not: null },
            buildingId: buildingIdFilter(buildingIds),
          },
        },
      },
      select: {
        periodicTaskInstance: {
          select: {
            task: {
              select: {
                buildingId: true,
                zoneId: true,
                building: { select: { id: true, name: true, deletedAt: true } },
                zone: {
                  select: {
                    id: true,
                    name: true,
                    floor: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    for (const exec of periodicDone) {
      const task = exec.periodicTaskInstance?.task;
      if (!task?.zoneId || !task.zone || task.building.deletedAt) continue;
      const key = `${task.buildingId}|${task.zoneId}`;
      if (!zoneMap.has(key)) {
        zoneMap.set(key, {
          zoneId: task.zoneId,
          zoneName: task.zone.name,
          floorId: task.zone.floor?.id ?? null,
          floorName: task.zone.floor?.name ?? null,
          buildingId: task.buildingId,
          buildingName: task.building.name,
          durationMs: null,
          source: 'periodic',
        });
      }
    }

    const zones = [...zoneMap.values()].sort((a, b) => {
      const buildingCmp = a.buildingName.localeCompare(b.buildingName, 'es');
      if (buildingCmp !== 0) return buildingCmp;
      return a.zoneName.localeCompare(b.zoneName, 'es');
    });

    const auxiliaryTimeMs = Math.max(0, totalClockedMs - attributedServiceMs);

    const reportTasks: Array<{
      taskName: string;
      executedAt: Date;
      zoneName: string | null;
      buildingName: string;
      reportFields: ReturnType<typeof mapSnapshotReportFields>;
    }> = [];

    const woTaskExecutions = await this.prisma.taskExecutionRecord.findMany({
      where: {
        status: 'DONE',
        executedById: query.userId,
        executedAt: { gte: dateFrom, lt: endExclusive },
        workOrderTaskId: { not: null },
        workOrderTask: {
          customFieldSnapshots: { some: { showInReport: true } },
        },
        serviceExecution: {
          workOrder: {
            deletedAt: null,
            buildingId: buildingIdFilter(buildingIds),
          },
        },
      },
      select: {
        executedAt: true,
        workOrderTask: {
          select: {
            nameSnapshot: true,
          },
        },
        fieldValues: {
          select: {
            selectedOptionIds: true,
            snapshotField: {
              select: {
                id: true,
                labelSnapshot: true,
                showInReport: true,
                optionSnapshots: { select: { id: true, labelSnapshot: true } },
              },
            },
          },
        },
        serviceExecution: {
          select: {
            workOrder: {
              select: {
                building: { select: { name: true, deletedAt: true } },
                zone: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { executedAt: 'desc' },
    });

    for (const te of woTaskExecutions) {
      const wo = te.serviceExecution?.workOrder;
      if (!wo || wo.building.deletedAt) continue;
      const fields = mapSnapshotReportFields(te.fieldValues);
      if (fields.length === 0) continue;
      reportTasks.push({
        taskName: te.workOrderTask?.nameSnapshot ?? 'Tarea',
        executedAt: te.executedAt,
        zoneName: wo.zone?.name ?? null,
        buildingName: wo.building.name,
        reportFields: fields,
      });
    }

    const periodicReportTasks = await this.prisma.taskExecutionRecord.findMany({
      where: {
        status: 'DONE',
        executedById: query.userId,
        executedAt: { gte: dateFrom, lt: endExclusive },
        periodicTaskInstanceId: { not: null },
        periodicTaskInstance: {
          task: {
            deletedAt: null,
            buildingId: buildingIdFilter(buildingIds),
            customFields: { some: { showInReport: true } },
          },
        },
      },
      select: {
        executedAt: true,
        periodicTaskInstance: {
          select: {
            task: {
              select: {
                name: true,
                building: { select: { name: true, deletedAt: true } },
                zone: { select: { name: true } },
              },
            },
          },
        },
        fieldValues: {
          select: {
            selectedOptionIds: true,
            masterField: {
              select: {
                id: true,
                label: true,
                showInReport: true,
                options: { select: { id: true, label: true } },
              },
            },
          },
        },
      },
      orderBy: { executedAt: 'desc' },
    });

    for (const te of periodicReportTasks) {
      const task = te.periodicTaskInstance?.task;
      if (!task || task.building.deletedAt) continue;
      const fields = mapMasterReportFields(te.fieldValues);
      if (fields.length === 0) continue;
      reportTasks.push({
        taskName: task.name,
        executedAt: te.executedAt,
        zoneName: task.zone?.name ?? null,
        buildingName: task.building.name,
        reportFields: fields,
      });
    }

    reportTasks.sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());

    return {
      userId: targetUser.id,
      userName: targetUser.fullName,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      totalClockedMs,
      auxiliaryTimeMs,
      zones,
      reportTasks,
    };
  }

  async getBuildingReport(query: BuildingReportQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, MAX_REPORT_PAGE_SIZE);
    const { dateFrom, endExclusive } = parseReportDateRange(query.dateFrom, query.dateTo);

    await assertBuildingAccess(this.prisma, user.id, query.buildingId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      buildingId: query.buildingId,
      deletedAt: null,
      status: 'COMPLETED',
      completedAt: { gte: dateFrom, lt: endExclusive },
    };
    if (query.floorId) where.floorId = query.floorId;
    if (query.zoneId) where.zoneId = query.zoneId;

    const [workOrders, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        orderBy: [{ completedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          scheduledDate: true,
          completedAt: true,
          building: { select: { id: true, name: true } },
          floor: { select: { id: true, name: true } },
          zone: { select: { id: true, name: true } },
          subzone: { select: { id: true, name: true } },
          serviceExecutions: {
            where: { status: 'COMPLETED' },
            select: {
              id: true,
              completedAt: true,
              participants: {
                select: {
                  user: { select: { id: true, fullName: true, deletedAt: true } },
                },
              },
              taskExecutions: {
                where: { status: { in: ['DONE', 'NOT_DONE', 'SKIPPED'] } },
                select: {
                  id: true,
                  status: true,
                  executedAt: true,
                  executedBy: { select: { id: true, fullName: true, deletedAt: true } },
                  workOrderTask: {
                    select: {
                      id: true,
                      nameSnapshot: true,
                    },
                  },
                  fieldValues: {
                    select: {
                      selectedOptionIds: true,
                      snapshotField: {
                        select: {
                          id: true,
                          labelSnapshot: true,
                          showInReport: true,
                          optionSnapshots: {
                            select: { id: true, labelSnapshot: true },
                          },
                        },
                      },
                      masterField: {
                        select: {
                          id: true,
                          label: true,
                          showInReport: true,
                          options: { select: { id: true, label: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));

    const periodicExecutions = await this.prisma.taskExecutionRecord.findMany({
      where: {
        status: 'DONE',
        executedAt: { gte: dateFrom, lt: endExclusive },
        periodicTaskInstance: {
          task: {
            deletedAt: null,
            buildingId: query.buildingId,
            ...(query.floorId ? { zone: { floorId: query.floorId } } : {}),
            ...(query.zoneId ? { zoneId: query.zoneId } : {}),
          },
        },
      },
      orderBy: { executedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        status: true,
        executedAt: true,
        executedBy: { select: { id: true, fullName: true, deletedAt: true } },
        periodicTaskInstance: {
          select: {
            task: {
              select: {
                id: true,
                name: true,
                zone: {
                  select: {
                    id: true,
                    name: true,
                    floor: { select: { id: true, name: true } },
                  },
                },
                subzone: { select: { id: true, name: true } },
              },
            },
          },
        },
        fieldValues: {
          select: {
            selectedOptionIds: true,
            masterField: {
              select: {
                id: true,
                label: true,
                showInReport: true,
                options: { select: { id: true, label: true } },
              },
            },
          },
        },
      },
    });

    return {
      buildingId: query.buildingId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      floorId: query.floorId ?? null,
      zoneId: query.zoneId ?? null,
      services: workOrders.map((wo) => {
        const execution = wo.serviceExecutions[0] ?? null;
        const workers = execution
          ? [
              ...new Set(
                execution.participants
                  .filter((p) => !p.user.deletedAt)
                  .map((p) => p.user.fullName),
              ),
            ]
          : [];

        const tasks =
          execution?.taskExecutions
            .filter((te) => !te.executedBy.deletedAt)
            .map((te) => {
              const snapshotFields = mapSnapshotReportFields(te.fieldValues);
              const masterFields = mapMasterReportFields(te.fieldValues);
              const reportFields = [...snapshotFields, ...masterFields];

              return {
                name: te.workOrderTask?.nameSnapshot ?? 'Tarea',
                status: te.status,
                executedAt: te.executedAt,
                executedBy: te.executedBy.fullName,
                reportFields,
              };
            }) ?? [];

        return {
          id: wo.id,
          type: wo.type,
          title: wo.title,
          scheduledDate: wo.scheduledDate,
          completedAt: wo.completedAt ?? execution?.completedAt ?? null,
          location: {
            building: wo.building?.name ?? null,
            floor: wo.floor?.name ?? null,
            zone: wo.zone?.name ?? null,
            subzone: wo.subzone?.name ?? null,
          },
          workers,
          tasks,
        };
      }),
      periodicTasks: periodicExecutions
        .filter((te) => !te.executedBy.deletedAt)
        .map((te) => {
          const task = te.periodicTaskInstance!.task;
          return {
            id: te.id,
            name: task.name,
            status: te.status,
            executedAt: te.executedAt,
            executedBy: te.executedBy.fullName,
            location: {
              floor: task.zone?.floor?.name ?? null,
              zone: task.zone?.name ?? null,
              subzone: task.subzone?.name ?? null,
            },
            reportFields: mapMasterReportFields(te.fieldValues),
          };
        }),
      total,
      page,
      limit,
      pages,
    };
  }
}
