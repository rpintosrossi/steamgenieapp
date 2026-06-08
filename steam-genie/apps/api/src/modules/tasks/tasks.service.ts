import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}
  // TODO: IMPORTANT: never return tasks with frequency=EVENTUAL in the periodic tasks module. Filter frequency != EVENTUAL for periodic queries.
}
