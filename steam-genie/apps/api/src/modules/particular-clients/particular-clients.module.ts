import { Module } from '@nestjs/common';
import { ParticularClientsController } from './particular-clients.controller';
import { ParticularClientsService } from './particular-clients.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [ParticularClientsController],
  providers: [ParticularClientsService, RolesGuard],
  exports: [ParticularClientsService],
})
export class ParticularClientsModule {}
