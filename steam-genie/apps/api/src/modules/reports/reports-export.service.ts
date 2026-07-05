import { Injectable } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { BuildingReportQueryDto } from './dto/building-report-query.dto';
import { DateReportQueryDto } from './dto/date-report-query.dto';
import { WorkerReportQueryDto } from './dto/worker-report-query.dto';
import type { AuthUser } from '@steam-genie/shared-types';
import { MAX_REPORT_PAGE_SIZE } from './helpers/report-query.helpers';
import {
  buildCsv,
  formatDateTimeForCsv,
  formatDurationForCsv,
  formatReportFieldsForCsv,
  reportCsvFilename,
} from './helpers/csv.helper';

@Injectable()
export class ReportsExportService {
  constructor(private readonly reportsService: ReportsService) {}

  async exportDateReportCsv(query: DateReportQueryDto, user: AuthUser) {
    const allRows: Awaited<ReturnType<ReportsService['getDateReport']>>['rows'] = [];
    let page = 1;
    let pages = 1;

    do {
      const chunk = await this.reportsService.getDateReport(
        { ...query, page, limit: MAX_REPORT_PAGE_SIZE },
        user,
      );
      allRows.push(...chunk.rows);
      pages = chunk.pages;
      page++;
    } while (page <= pages);

    const csvRows: string[][] = [
      ['Día', 'Trabajador', 'Edificios', 'Zonas limpiadas'],
      ...allRows.map((row) => [
        row.date,
        row.worker.fullName,
        row.buildings.map((b) => b.name).join('; '),
        row.cleanedZones
          .map((z) => [z.buildingName, z.floorName, z.zoneName].filter(Boolean).join(' / '))
          .join('; '),
      ]),
    ];

    return {
      buffer: buildCsv(csvRows),
      filename: reportCsvFilename('reporte-por-fecha', query.dateFrom, query.dateTo),
    };
  }

  async exportWorkerReportCsv(query: WorkerReportQueryDto, user: AuthUser) {
    const report = await this.reportsService.getWorkerReport(query, user);

    const csvRows: string[][] = [
      ['Campo', 'Valor'],
      ['Trabajador', report.userName],
      ['Desde', query.dateFrom.slice(0, 10)],
      ['Hasta', query.dateTo.slice(0, 10)],
      ['Horas totales fichadas', formatDurationForCsv(report.totalClockedMs)],
      ['Tiempo auxiliar remanente', formatDurationForCsv(report.auxiliaryTimeMs)],
      [],
      ['Edificio', 'Planta', 'Zona', 'Tiempo', 'Origen'],
      ...report.zones.map((zone) => [
        zone.buildingName,
        zone.floorName ?? '',
        zone.zoneName,
        formatDurationForCsv(zone.durationMs),
        zone.source === 'service' ? 'Servicio' : 'Recurrente',
      ]),
      [],
      ['Tarea', 'Edificio', 'Zona', 'Fecha', 'Campos del reporte'],
      ...report.reportTasks.map((task) => [
        task.taskName,
        task.buildingName,
        task.zoneName ?? '',
        formatDateTimeForCsv(task.executedAt),
        formatReportFieldsForCsv(task.reportFields),
      ]),
    ];

    return {
      buffer: buildCsv(csvRows),
      filename: reportCsvFilename(
        `reporte-trabajador-${slugify(report.userName)}`,
        query.dateFrom,
        query.dateTo,
      ),
    };
  }

  async exportBuildingReportCsv(query: BuildingReportQueryDto, user: AuthUser) {
    const services: Awaited<
      ReturnType<ReportsService['getBuildingReport']>
    >['services'] = [];
    let periodicTasks: Awaited<
      ReturnType<ReportsService['getBuildingReport']>
    >['periodicTasks'] = [];
    let page = 1;
    let pages = 1;

    do {
      const chunk = await this.reportsService.getBuildingReport(
        { ...query, page, limit: MAX_REPORT_PAGE_SIZE },
        user,
      );
      services.push(...chunk.services);
      if (page === 1) periodicTasks = chunk.periodicTasks;
      pages = chunk.pages;
      page++;
    } while (page <= pages);

    const csvRows: string[][] = [
      [
        'Tipo',
        'Servicio / Tarea',
        'Tipo servicio',
        'Planta',
        'Zona',
        'Subzona',
        'Trabajadores',
        'Tarea',
        'Estado',
        'Ejecutada por',
        'Fecha',
        'Campos del reporte',
      ],
    ];

    for (const service of services) {
      if (service.tasks.length === 0) {
        csvRows.push([
          'Servicio',
          service.title,
          service.type,
          service.location.floor ?? '',
          service.location.zone ?? '',
          service.location.subzone ?? '',
          service.workers.join('; '),
          '',
          '',
          '',
          formatDateTimeForCsv(service.completedAt),
          '',
        ]);
        continue;
      }

      for (const task of service.tasks) {
        csvRows.push([
          'Servicio',
          service.title,
          service.type,
          service.location.floor ?? '',
          service.location.zone ?? '',
          service.location.subzone ?? '',
          service.workers.join('; '),
          task.name,
          task.status,
          task.executedBy,
          formatDateTimeForCsv(task.executedAt),
          formatReportFieldsForCsv(task.reportFields),
        ]);
      }
    }

    for (const task of periodicTasks) {
      csvRows.push([
        'Recurrente',
        task.name,
        '',
        task.location.floor ?? '',
        task.location.zone ?? '',
        task.location.subzone ?? '',
        '',
        task.name,
        task.status,
        task.executedBy,
        formatDateTimeForCsv(task.executedAt),
        formatReportFieldsForCsv(task.reportFields),
      ]);
    }

    return {
      buffer: buildCsv(csvRows),
      filename: reportCsvFilename('reporte-por-edificio', query.dateFrom, query.dateTo),
    };
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);
}
