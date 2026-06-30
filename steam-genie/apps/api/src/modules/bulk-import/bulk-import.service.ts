import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TaskFrequency } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import {
  buildImportTemplateBuffer,
  frequencyLabel,
  parseFrequency,
  parseImportWorkbook,
  parseStartDate,
} from './bulk-import.excel';
import type {
  BulkImportResult,
  BulkImportRowInterpretation,
  BulkImportRowResult,
  ParsedImportRow,
  TemplateRowData,
} from './bulk-import.types';

interface ImportSessionCache {
  floorsCreated: number;
  zonesCreated: number;
  subzonesCreated: number;
  tasksCreated: number;
  tasksUpdated: number;
  tasksSkipped: number;
  buildingsTouched: Set<string>;
  zonesWithSubzones: Set<string>;
}

@Injectable()
export class BulkImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  async generateTemplateForBuilding(
    buildingId: string,
    mode: 'empty' | 'current',
  ): Promise<Buffer> {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!building) {
      throw new NotFoundException('Edificio no encontrado.');
    }

    if (mode === 'empty') {
      return buildImportTemplateBuffer(undefined, {
        buildingName: building.name,
        buildingScoped: true,
      });
    }

    const rows = await this.collectBuildingExportRows(building.id, building.name);
    return buildImportTemplateBuffer(rows, { buildingScoped: true });
  }

  async processExcelForBuilding(
    buildingId: string,
    buffer: Buffer,
  ): Promise<BulkImportResult> {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!building) {
      throw new NotFoundException('Edificio no encontrado.');
    }

    return this.processExcel(buffer, building);
  }

  private async collectBuildingExportRows(
    buildingId: string,
    buildingName: string,
  ): Promise<TemplateRowData[]> {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, deletedAt: null },
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

    if (!building) return [];

    const tasks = await this.prisma.task.findMany({
      where: { buildingId, deletedAt: null },
      include: {
        zone: { include: { floor: true } },
        subzone: true,
      },
      orderBy: [{ zone: { floor: { sortOrder: 'asc' } } }, { name: 'asc' }],
    });

    const rows: TemplateRowData[] = [];

    for (const task of tasks) {
      if (!task.zone?.floor) continue;

      rows.push({
        buildingName,
        floorName: task.zone.floor.name,
        zoneName: task.zone.name,
        subzoneName: task.subzone?.name,
        taskName: task.name,
        frequencyRaw: frequencyLabel(task.frequency),
        startDateRaw: task.startDate.toISOString().slice(0, 10),
        requiresPhoto: task.requiresPhoto,
        allowsObservation: task.allowsObservation,
        requiresRejectionReason: task.requiresRejectionReason,
      });
    }

    for (const floor of building.floors) {
      for (const zone of floor.zones) {
        if (zone.subzones.length > 0) {
          for (const subzone of zone.subzones) {
            const hasTask = tasks.some(
              (task) => task.zoneId === zone.id && task.subzoneId === subzone.id,
            );
            if (!hasTask) {
              rows.push({
                buildingName,
                floorName: floor.name,
                zoneName: zone.name,
                subzoneName: subzone.name,
              });
            }
          }
        } else {
          const hasTask = tasks.some(
            (task) => task.zoneId === zone.id && !task.subzoneId,
          );
          if (!hasTask) {
            rows.push({
              buildingName,
              floorName: floor.name,
              zoneName: zone.name,
            });
          }
        }
      }
    }

    return rows;
  }

  private async processExcel(
    buffer: Buffer,
    scopedBuilding?: { id: string; name: string },
  ): Promise<BulkImportResult> {
    let parsedRows: ParsedImportRow[];

    try {
      parsedRows = await parseImportWorkbook(buffer);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'No se pudo leer el archivo Excel.',
      );
    }

    if (parsedRows.length === 0) {
      throw new BadRequestException('El archivo no contiene filas de datos (solo encabezados).');
    }

    const cache: ImportSessionCache = {
      floorsCreated: 0,
      zonesCreated: 0,
      subzonesCreated: 0,
      tasksCreated: 0,
      tasksUpdated: 0,
      tasksSkipped: 0,
      buildingsTouched: new Set<string>(),
      zonesWithSubzones: new Set<string>(),
    };

    const rows: BulkImportRowResult[] = [];

    for (const row of parsedRows) {
      rows.push(await this.processRow(row, cache, scopedBuilding));
    }

    const successCount = rows.filter((r) => r.status === 'success').length;
    const errorCount = rows.filter((r) => r.status === 'error').length;
    const skippedCount = rows.filter((r) => r.status === 'skipped').length;

    return {
      totalRows: parsedRows.length,
      processedRows: rows.length,
      successCount,
      errorCount,
      skippedCount,
      rows,
      summary: {
        buildingsTouched: [...cache.buildingsTouched],
        floorsCreated: cache.floorsCreated,
        zonesCreated: cache.zonesCreated,
        subzonesCreated: cache.subzonesCreated,
        tasksCreated: cache.tasksCreated,
        tasksUpdated: cache.tasksUpdated,
        tasksSkipped: cache.tasksSkipped,
      },
    };
  }

  private async processRow(
    row: ParsedImportRow,
    cache: ImportSessionCache,
    scopedBuilding?: { id: string; name: string },
  ): Promise<BulkImportRowResult> {
    const { rowNumber } = row;

    if (!row.buildingName.trim()) {
      return this.errorRow(rowNumber, 'Falta el nombre del edificio.');
    }
    if (!row.floorName.trim()) {
      return this.errorRow(rowNumber, 'Falta el nombre de la planta.');
    }
    if (!row.zoneName.trim()) {
      return this.errorRow(rowNumber, 'Falta el nombre de la zona.');
    }

    try {
      const building = scopedBuilding
        ? await this.assertScopedBuilding(row.buildingName, scopedBuilding)
        : await this.findBuildingByName(row.buildingName);

      cache.buildingsTouched.add(building.name);

      const { floor, created: floorCreated } = await this.findOrCreateFloor(
        building.id,
        row.floorName,
        cache,
      );

      const { zone, created: zoneCreated } = await this.findOrCreateZone(
        building.id,
        floor.id,
        row.zoneName,
        cache,
      );

      let subzone: { id: string; name: string } | undefined;
      let subzoneCreated = false;

      if (row.subzoneName?.trim()) {
        const result = await this.findOrCreateSubzone(
          building.id,
          zone.id,
          row.subzoneName,
          cache,
        );
        subzone = result.subzone;
        subzoneCreated = result.created;
        cache.zonesWithSubzones.add(zone.id);
      }

      const interpretation: BulkImportRowInterpretation = {
        building: building.name,
        buildingId: building.id,
        floor: floor.name,
        floorCreated,
        zone: zone.name,
        zoneCreated,
        subzone: subzone?.name,
        subzoneCreated: subzone ? subzoneCreated : undefined,
      };

      if (!row.taskName?.trim()) {
        const parts: string[] = [];
        if (floorCreated) parts.push(`planta "${floor.name}" creada`);
        else parts.push(`planta "${floor.name}" existente`);
        if (zoneCreated) parts.push(`zona "${zone.name}" creada`);
        else parts.push(`zona "${zone.name}" existente`);
        if (subzone) {
          parts.push(
            subzoneCreated
              ? `subzona "${subzone.name}" creada`
              : `subzona "${subzone.name}" existente`,
          );
        }

        return {
          row: rowNumber,
          status: 'success',
          message: `Estructura procesada: ${parts.join('; ')}.`,
          interpretation,
        };
      }

      const frequencyCode = parseFrequency(row.frequencyRaw);
      if (!frequencyCode) {
        return this.errorRow(
          rowNumber,
          `Frecuencia inválida "${row.frequencyRaw ?? ''}". Usá valores como Diaria, Semanal, Eventual (checkout), etc.`,
          interpretation,
        );
      }

      const zoneHasSubzones = await this.zoneHasSubzones(zone.id, cache);
      if (zoneHasSubzones && !subzone) {
        return this.errorRow(
          rowNumber,
          `La zona "${zone.name}" tiene subzonas. No podés asignar la tarea "${row.taskName}" directamente a la zona: indicá la subzona en esta fila.`,
          interpretation,
        );
      }

      const startDate = parseStartDate(row.startDateRaw);
      if (row.startDateRaw && !startDate) {
        return this.errorRow(
          rowNumber,
          `Fecha de inicio inválida "${String(row.startDateRaw)}". Usá YYYY-MM-DD o DD/MM/YYYY.`,
          interpretation,
        );
      }

      const requiresPhoto = row.requiresPhoto ?? false;
      const allowsObservation = row.allowsObservation ?? true;
      const requiresRejectionReason = row.requiresRejectionReason ?? true;

      const existingTask = await this.prisma.task.findFirst({
        where: {
          buildingId: building.id,
          zoneId: zone.id,
          subzoneId: subzone?.id ?? null,
          name: { equals: row.taskName.trim(), mode: 'insensitive' },
          deletedAt: null,
        },
      });

      if (existingTask) {
        const existingStartDate = existingTask.startDate.toISOString().slice(0, 10);
        const targetStartDate = startDate ?? existingStartDate;
        const unchanged =
          existingTask.frequency === frequencyCode &&
          existingStartDate === targetStartDate &&
          existingTask.requiresPhoto === requiresPhoto &&
          existingTask.allowsObservation === allowsObservation &&
          existingTask.requiresRejectionReason === requiresRejectionReason;

        if (unchanged) {
          cache.tasksSkipped += 1;
          return {
            row: rowNumber,
            status: 'skipped',
            message: `La tarea "${existingTask.name}" ya existe sin cambios. Se omitió.`,
            interpretation: {
              ...interpretation,
              task: existingTask.name,
              taskSkipped: true,
              frequency: frequencyCode as TaskFrequency,
              startDate: targetStartDate,
            },
          };
        }

        await this.prisma.task.update({
          where: { id: existingTask.id },
          data: {
            frequency: frequencyCode as TaskFrequency,
            startDate: new Date(targetStartDate),
            requiresPhoto,
            allowsObservation,
            requiresRejectionReason,
          },
        });

        cache.tasksUpdated += 1;

        return {
          row: rowNumber,
          status: 'success',
          message: `Tarea "${existingTask.name}" actualizada (${frequencyCode}).`,
          interpretation: {
            ...interpretation,
            task: existingTask.name,
            taskUpdated: true,
            frequency: frequencyCode as TaskFrequency,
            startDate: targetStartDate,
          },
        };
      }

      await this.tasksService.create({
        buildingId: building.id,
        zoneId: zone.id,
        subzoneId: subzone?.id,
        name: row.taskName.trim(),
        frequency: frequencyCode as TaskFrequency,
        startDate,
        requiresPhoto,
        allowsObservation,
        requiresRejectionReason,
        isActive: true,
      });

      cache.tasksCreated += 1;

      return {
        row: rowNumber,
        status: 'success',
        message: `Tarea "${row.taskName.trim()}" creada (${frequencyCode}).`,
        interpretation: {
          ...interpretation,
          task: row.taskName.trim(),
          taskCreated: true,
          frequency: frequencyCode as TaskFrequency,
          startDate,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido al procesar la fila.';
      return this.errorRow(rowNumber, message);
    }
  }

  private async assertScopedBuilding(
    rowBuildingName: string,
    scopedBuilding: { id: string; name: string },
  ) {
    if (
      rowBuildingName.trim().toLowerCase() !== scopedBuilding.name.trim().toLowerCase()
    ) {
      throw new Error(
        `La fila indica el edificio "${rowBuildingName.trim()}" pero la importación es para "${scopedBuilding.name}". Corregí la columna Edificio o descargá la plantilla de este edificio.`,
      );
    }

    return scopedBuilding;
  }

  private async findBuildingByName(name: string) {
    const matches = await this.prisma.building.findMany({
      where: {
        deletedAt: null,
        name: { equals: name.trim(), mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });

    if (matches.length === 0) {
      throw new Error(
        `Edificio "${name.trim()}" no encontrado. Creá el edificio primero o verificá el nombre exacto.`,
      );
    }

    if (matches.length > 1) {
      throw new Error(
        `Hay ${matches.length} edificios con el nombre "${name.trim()}". Renombrá uno para poder importar.`,
      );
    }

    return matches[0];
  }

  private async findOrCreateFloor(
    buildingId: string,
    name: string,
    cache: ImportSessionCache,
  ) {
    const trimmed = name.trim();
    let floor = await this.prisma.floor.findFirst({
      where: { buildingId, name: { equals: trimmed, mode: 'insensitive' }, deletedAt: null },
    });

    if (floor) return { floor, created: false };

    const maxSort = await this.prisma.floor.aggregate({
      where: { buildingId, deletedAt: null },
      _max: { sortOrder: true },
    });

    floor = await this.prisma.floor.create({
      data: {
        buildingId,
        name: trimmed,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });

    cache.floorsCreated += 1;
    return { floor, created: true };
  }

  private async findOrCreateZone(
    buildingId: string,
    floorId: string,
    name: string,
    cache: ImportSessionCache,
  ) {
    const trimmed = name.trim();
    let zone = await this.prisma.zone.findFirst({
      where: { floorId, name: { equals: trimmed, mode: 'insensitive' }, deletedAt: null },
    });

    if (zone) return { zone, created: false };

    zone = await this.prisma.zone.create({
      data: {
        buildingId,
        floorId,
        name: trimmed,
        qrToken: randomUUID(),
      },
    });

    cache.zonesCreated += 1;
    return { zone, created: true };
  }

  private async findOrCreateSubzone(
    buildingId: string,
    zoneId: string,
    name: string,
    cache: ImportSessionCache,
  ) {
    const trimmed = name.trim();
    let subzone = await this.prisma.subzone.findFirst({
      where: { zoneId, name: { equals: trimmed, mode: 'insensitive' }, deletedAt: null },
    });

    if (subzone) return { subzone, created: false };

    subzone = await this.prisma.subzone.create({
      data: {
        buildingId,
        zoneId,
        name: trimmed,
        qrToken: randomUUID(),
      },
    });

    cache.subzonesCreated += 1;
    cache.zonesWithSubzones.add(zoneId);
    return { subzone, created: true };
  }

  private async zoneHasSubzones(zoneId: string, cache: ImportSessionCache): Promise<boolean> {
    if (cache.zonesWithSubzones.has(zoneId)) return true;

    const count = await this.prisma.subzone.count({
      where: { zoneId, deletedAt: null },
    });

    if (count > 0) cache.zonesWithSubzones.add(zoneId);
    return count > 0;
  }

  private errorRow(
    row: number,
    message: string,
    interpretation?: BulkImportRowInterpretation,
  ): BulkImportRowResult {
    return { row, status: 'error', message, interpretation };
  }
}
