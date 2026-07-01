import { Module } from '@nestjs/common';
import { RejectionReasonsController } from './rejection-reasons.controller';
import { RejectionReasonsService } from './rejection-reasons.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [RejectionReasonsController],
  providers: [RejectionReasonsService, RolesGuard],
  exports: [RejectionReasonsService],
})
export class RejectionReasonsModule {}
