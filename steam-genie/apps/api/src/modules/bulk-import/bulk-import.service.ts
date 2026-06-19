import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TaskFrequency } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import {
  buildImportTemplateBuffer,
  parseFrequency,
  parseImportWorkbook,
  parseStartDate,
} from './bulk-import.excel';
import type {
  BulkImportResult,
  BulkImportRowInterpretation,
  BulkImportRowResult,
  ParsedImportRow,
} from './bulk-import.types';

interface ImportSessionCache {
  floorsCreated: number;
  zonesCreated: number;
  subzonesCreated: number;
  tasksCreated: number;
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

  async generateTemplate(): Promise<Buffer> {
    return buildImportTemplateBuffer();
  }

  async processExcel(buffer: Buffer): Promise<BulkImportResult> {
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
      tasksSkipped: 0,
      buildingsTouched: new Set<string>(),
      zonesWithSubzones: new Set<string>(),
    };

    const rows: BulkImportRowResult[] = [];

    for (const row of parsedRows) {
      rows.push(await this.processRow(row, cache));
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
        tasksSkipped: cache.tasksSkipped,
      },
    };
  }

  private async processRow(
    row: ParsedImportRow,
    cache: ImportSessionCache,
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
      const building = await this.findBuildingByName(row.buildingName);
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

      const existingTask = await this.prisma.task.findFirst({
        where: {
          buildingId: building.id,
          zoneId: zone.id,
          subzoneId: subzone?.id ?? null,
          name: { equals: row.taskName.trim(), mode: 'insensitive' },
          deletedAt: null,
        },
        select: { id: true, name: true },
      });

      if (existingTask) {
        cache.tasksSkipped += 1;
        return {
          row: rowNumber,
          status: 'skipped',
          message: `La tarea "${existingTask.name}" ya existe en esa ubicación. Se omitió.`,
          interpretation: {
            ...interpretation,
            task: existingTask.name,
            taskSkipped: true,
            frequency: frequencyCode as TaskFrequency,
            startDate,
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
        requiresPhoto: row.requiresPhoto ?? false,
        allowsObservation: row.allowsObservation ?? true,
        requiresRejectionReason: row.requiresRejectionReason ?? true,
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
