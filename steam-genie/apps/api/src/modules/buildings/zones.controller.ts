import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { BuildingsService } from './buildings.service';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { CreateSubzoneDto } from './dto/create-subzone.dto';

@Controller('zones')
@UseGuards(JwtAuthGuard, RolesGuard, BuildingAccessGuard)
export class ZonesController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateZoneDto) {
    return this.buildingsService.updateZone(id, dto);
  }

  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.buildingsService.removeZone(id);
  }

  @Get(':zoneId/subzones')
  @RequiredRoles('admin', 'manager')
  getSubzones(@Param('zoneId', ParseUUIDPipe) zoneId: string) {
    return this.buildingsService.getSubzones(zoneId);
  }

  @Post(':zoneId/subzones')
  @RequiredRoles('admin', 'manager')
  createSubzone(
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @Body() dto: CreateSubzoneDto,
  ) {
    return this.buildingsService.createSubzone(zoneId, dto);
  }
}
