import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [ReservationsController],
  providers: [ReservationsService, RolesGuard],
  exports: [ReservationsService],
})
export class ReservationsModule {}
