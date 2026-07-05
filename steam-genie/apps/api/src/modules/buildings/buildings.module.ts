import { Module } from '@nestjs/common';
import { BuildingsController } from './buildings.controller';
import { FloorsController } from './floors.controller';
import { ZonesController } from './zones.controller';
import { SubzonesController } from './subzones.controller';
import { BuildingsService } from './buildings.service';
import { UsersModule } from '../users/users.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';

@Module({
  imports: [UsersModule],
  controllers: [BuildingsController, FloorsController, ZonesController, SubzonesController],
  providers: [BuildingsService, RolesGuard, BuildingAccessGuard],
  exports: [BuildingsService],
})
export class BuildingsModule {}
