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
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { QueryUserDetailDto } from './dto/query-user-detail.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignBuildingRoleDto } from './dto/assign-building-role.dto';
import { SyncBuildingRolesDto } from './dto/sync-building-roles.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import type { AuthUser } from '@steam-genie/shared-types';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequiredRoles('admin', 'manager')
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Post()
  @RequiredRoles('admin')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.create(dto, user.id);
  }

  // NOTE: must be declared before :id routes to avoid 'me' being matched as UUID
  @Post('me/devices')
  registerDevice(@Body() dto: RegisterDeviceDto, @CurrentUser() user: AuthUser) {
    return this.usersService.upsertDevice(user.id, dto);
  }

  @Get(':id')
  @RequiredRoles('admin', 'manager')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Query() query: QueryUserDetailDto) {
    return this.usersService.findOne(id, query);
  }

  @Patch(':id')
  @RequiredRoles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @RequiredRoles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }

  @Get(':id/building-roles')
  @RequiredRoles('admin', 'manager')
  getBuildingRoles(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getBuildingRoles(id);
  }

  @Put(':id/building-roles/bulk')
  @RequiredRoles('admin')
  syncBuildingRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SyncBuildingRolesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.syncBuildingRoles(id, dto, user.id);
  }

  @Post(':id/building-roles')
  @RequiredRoles('admin')
  assignBuildingRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignBuildingRoleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.assignBuildingRole(id, dto, user.id);
  }

  @Delete(':id/building-roles/:buildingRoleId')
  @RequiredRoles('admin')
  removeBuildingRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('buildingRoleId', ParseUUIDPipe) buildingRoleId: string,
  ) {
    return this.usersService.removeBuildingRole(id, buildingRoleId);
  }
}
