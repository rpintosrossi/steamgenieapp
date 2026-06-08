import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}
  // TODO: POST /sync/batch — idempotent, version-based conflict detection. GET /sync/prefetch — returns work_orders + tasks for offline.
}
