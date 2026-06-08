import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}
  // TODO: When a reservation is created, auto-generate a CHECKOUT_CLEANING work_order and create work_order_tasks snapshots from EVENTUAL tasks of the zone/subzone.
}
