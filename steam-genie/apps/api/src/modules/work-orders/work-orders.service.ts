import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: On WO creation, generate work_order_tasks snapshots from EVENTUAL tasks.
  // TODO: implement accept/reject/start work order endpoints.
}
