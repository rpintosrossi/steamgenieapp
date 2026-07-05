import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';

import type { Response } from 'express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { RolesGuard } from '../../common/guards/roles.guard';

import { ModulesGuard } from '../../common/guards/modules.guard';

import { RequiredRoles } from '../../common/decorators/required-roles.decorator';

import { RequiredModules } from '../../common/decorators/required-modules.decorator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { APP_MODULES } from '@steam-genie/shared-constants';

import { ReportsService } from './reports.service';

import { ReportsExportService } from './reports-export.service';

import { BuildingReportQueryDto } from './dto/building-report-query.dto';

import { DateReportQueryDto } from './dto/date-report-query.dto';

import { WorkerReportQueryDto } from './dto/worker-report-query.dto';

import type { AuthUser } from '@steam-genie/shared-types';



@Controller('reports')

@UseGuards(JwtAuthGuard, RolesGuard, ModulesGuard)

export class ReportsController {

  constructor(

    private readonly reportsService: ReportsService,

    private readonly reportsExportService: ReportsExportService,

  ) {}



  @Get('by-date')

  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.REPORTES)
  getDateReport(@Query() query: DateReportQueryDto, @CurrentUser() user: AuthUser) {

    return this.reportsService.getDateReport(query, user);

  }



  @Get('by-date/export')

  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.REPORTES)
  async exportDateReport(

    @Query() query: DateReportQueryDto,

    @CurrentUser() user: AuthUser,

    @Res() res: Response,

  ) {

    const { buffer, filename } = await this.reportsExportService.exportDateReportCsv(query, user);

    res.set({

      'Content-Type': 'text/csv; charset=utf-8',

      'Content-Disposition': `attachment; filename="${filename}"`,

      'Content-Length': buffer.length,

    });

    res.send(buffer);

  }



  @Get('by-worker')

  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.REPORTES)
  getWorkerReport(@Query() query: WorkerReportQueryDto, @CurrentUser() user: AuthUser) {

    return this.reportsService.getWorkerReport(query, user);

  }



  @Get('by-worker/export')

  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.REPORTES)
  async exportWorkerReport(

    @Query() query: WorkerReportQueryDto,

    @CurrentUser() user: AuthUser,

    @Res() res: Response,

  ) {

    const { buffer, filename } = await this.reportsExportService.exportWorkerReportCsv(query, user);

    res.set({

      'Content-Type': 'text/csv; charset=utf-8',

      'Content-Disposition': `attachment; filename="${filename}"`,

      'Content-Length': buffer.length,

    });

    res.send(buffer);

  }



  @Get('building')

  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.REPORTES)
  getBuildingReport(

    @Query() query: BuildingReportQueryDto,

    @CurrentUser() user: AuthUser,

  ) {

    return this.reportsService.getBuildingReport(query, user);

  }



  @Get('building/export')

  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.REPORTES)
  async exportBuildingReport(

    @Query() query: BuildingReportQueryDto,

    @CurrentUser() user: AuthUser,

    @Res() res: Response,

  ) {

    const { buffer, filename } = await this.reportsExportService.exportBuildingReportCsv(

      query,

      user,

    );

    res.set({

      'Content-Type': 'text/csv; charset=utf-8',

      'Content-Disposition': `attachment; filename="${filename}"`,

      'Content-Length': buffer.length,

    });

    res.send(buffer);

  }

}

