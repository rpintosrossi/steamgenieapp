import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { APP_MODULES } from '@steam-genie/shared-constants';
import type { AuthUser } from '@steam-genie/shared-types';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiredModules } from '../../common/decorators/required-modules.decorator';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModulesGuard } from '../../common/guards/modules.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CommissionsService } from './commissions.service';
import {
  CreateCommissionSettlementDto,
  QueryCommissionServicesDto,
  QuerySettlementsDto,
  UpdateCommissionSettlementDto,
} from './dto/commissions.dto';

@Controller('commissions')
@UseGuards(JwtAuthGuard, RolesGuard, ModulesGuard)
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get('beneficiaries')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.COMISIONES)
  listBeneficiaries() {
    return this.commissions.listBeneficiaries();
  }

  @Get('services')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.COMISIONES)
  listServices(@Query() query: QueryCommissionServicesDto) {
    return this.commissions.listCandidateServices(query);
  }

  @Get('fixed-expenses-preview')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.COMISIONES)
  previewFixed(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('buildingIds') buildingIds?: string,
  ) {
    const ids = buildingIds
      ? buildingIds.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    return this.commissions.previewFixedExpenses(dateFrom, dateTo, ids);
  }

  @Post()
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.COMISIONES)
  create(@Body() dto: CreateCommissionSettlementDto, @CurrentUser() user: AuthUser) {
    return this.commissions.create(dto, user);
  }

  @Get()
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.RENDICIONES, APP_MODULES.COMISIONES)
  list(@Query() query: QuerySettlementsDto) {
    return this.commissions.findAll(query);
  }

  @Get('mine/summary')
  @RequiredRoles('admin', 'manager', 'cleaner')
  @RequiredModules(APP_MODULES.MIS_RENDICIONES)
  mySummary(@CurrentUser() user: AuthUser) {
    return this.commissions.mySummary(user);
  }

  @Get('mine')
  @RequiredRoles('admin', 'manager', 'cleaner')
  @RequiredModules(APP_MODULES.MIS_RENDICIONES)
  listMine(@Query() query: QuerySettlementsDto, @CurrentUser() user: AuthUser) {
    return this.commissions.findMine(user, query);
  }

  @Get('mine/:id')
  @RequiredRoles('admin', 'manager', 'cleaner')
  @RequiredModules(APP_MODULES.MIS_RENDICIONES)
  getMine(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.commissions.findOne(id, user, { asMine: true });
  }

  @Get('mine/:id/pdf')
  @RequiredRoles('admin', 'manager', 'cleaner')
  @RequiredModules(APP_MODULES.MIS_RENDICIONES)
  async downloadMinePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query('version') version?: string,
  ) {
    return this.sendPdf(
      await this.commissions.downloadPdf(id, user, {
        version: version ? Number(version) : undefined,
      }),
      res,
    );
  }

  @Get(':id')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.RENDICIONES, APP_MODULES.COMISIONES)
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.commissions.findOne(id, user, { asAdmin: true });
  }

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.RENDICIONES, APP_MODULES.COMISIONES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommissionSettlementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commissions.update(id, dto, user);
  }

  @Get(':id/pdf')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.RENDICIONES, APP_MODULES.COMISIONES)
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query('version') version?: string,
  ) {
    return this.sendPdf(
      await this.commissions.downloadPdf(id, user, {
        asAdmin: true,
        version: version ? Number(version) : undefined,
      }),
      res,
    );
  }

  @Get(':id/pdf/:version')
  @RequiredRoles('admin', 'manager')
  @RequiredModules(APP_MODULES.RENDICIONES, APP_MODULES.COMISIONES)
  async downloadPdfVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sendPdf(
      await this.commissions.downloadPdf(id, user, { asAdmin: true, version }),
      res,
    );
  }

  private sendPdf(
    result: { redirectUrl?: string; file?: import('@nestjs/common').StreamableFile },
    res: Response,
  ) {
    if (result.redirectUrl) {
      res.redirect(302, result.redirectUrl);
      return;
    }
    return result.file;
  }
}
