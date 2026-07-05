import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { BuildingScoped } from '../../common/decorators/building-scoped.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BuildingsService } from './buildings.service';
import { UsersService } from '../users/users.service';
import { QueryBuildingsDto } from './dto/query-buildings.dto';
import { QueryAssignableCleanersDto } from './dto/query-assignable-cleaners.dto';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
import { CreateFloorDto } from './dto/create-floor.dto';
import { SyncBuildingUsersDto } from '../users/dto/sync-building-users.dto';
import type { AuthUser } from '@steam-genie/shared-types';

@Controller('buildings')
@UseGuards(JwtAuthGuard, RolesGuard, BuildingAccessGuard)
export class BuildingsController {
  constructor(
    private readonly buildingsService: BuildingsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  @RequiredRoles('admin', 'manager', 'cleaner', 'client', 'provider')
  findAll(@Query() query: QueryBuildingsDto, @CurrentUser() user: AuthUser) {
    return this.buildingsService.findAll(query, user);
  }

  @Post()
  @RequiredRoles('admin')
  create(@Body() dto: CreateBuildingDto) {
    return this.buildingsService.create(dto);
  }

  @Get(':id/hierarchy')
  @RequiredRoles('admin', 'manager', 'cleaner', 'client', 'provider')
  @BuildingScoped()
  findHierarchy(@Param('id', ParseUUIDPipe) id: string) {
    return this.buildingsService.findHierarchy(id);
  }

  @Get(':id/assignable-cleaners')
  @RequiredRoles('admin', 'manager')
  @BuildingScoped()
  findAssignableCleaners(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryAssignableCleanersDto,
  ) {
    return this.buildingsService.findAssignableCleaners(id, query);
  }

  @Get(':id/user-roles')
  @RequiredRoles('admin', 'manager')
  @BuildingScoped()
  getBuildingUserRoles(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getBuildingUserRoles(id);
  }

  @Put(':id/user-roles/bulk')
  @RequiredRoles('admin')
  @BuildingScoped()
  syncBuildingUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SyncBuildingUsersDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.syncBuildingUsers(id, dto, user.id);
  }

  @Get(':id')
  @RequiredRoles('admin', 'manager')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.buildingsService.findOne(id);
  }

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBuildingDto) {
    return this.buildingsService.update(id, dto);
  }

  @Delete(':id')
  @RequiredRoles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.buildingsService.remove(id);
  }

  // ─── Floors under building ─────────────────────────────────────────────────

  @Get(':buildingId/floors')
  @RequiredRoles('admin', 'manager')
  @BuildingScoped()
  getFloors(@Param('buildingId', ParseUUIDPipe) buildingId: string) {
    return this.buildingsService.getFloors(buildingId);
  }

  @Post(':buildingId/floors')
  @RequiredRoles('admin', 'manager')
  @BuildingScoped()
  createFloor(
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
    @Body() dto: CreateFloorDto,
  ) {
    return this.buildingsService.createFloor(buildingId, dto);
  }
}
