import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class ServiceExecutionsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: implement service execution logic
  // IMPORTANT: task marking uses workOrderTaskId (snapshot), never taskId directly.
  // Periodic tasks use periodicTaskInstanceId instead.
}
