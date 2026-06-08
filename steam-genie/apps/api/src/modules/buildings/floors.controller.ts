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
import { UpdateFloorDto } from './dto/update-floor.dto';
import { CreateZoneDto } from './dto/create-zone.dto';

@Controller('floors')
@UseGuards(JwtAuthGuard, RolesGuard, BuildingAccessGuard)
export class FloorsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFloorDto) {
    return this.buildingsService.updateFloor(id, dto);
  }

  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.buildingsService.removeFloor(id);
  }

  @Get(':floorId/zones')
  @RequiredRoles('admin', 'manager')
  getZones(@Param('floorId', ParseUUIDPipe) floorId: string) {
    return this.buildingsService.getZones(floorId);
  }

  @Post(':floorId/zones')
  @RequiredRoles('admin', 'manager')
  createZone(
    @Param('floorId', ParseUUIDPipe) floorId: string,
    @Body() dto: CreateZoneDto,
  ) {
    return this.buildingsService.createZone(floorId, dto);
  }
}
