import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { AuthUser } from '@steam-genie/shared-types';

/**
 * Guard for POST /work-orders/:id/accept and POST /work-orders/:id/reject.
 *
 * Validates:
 * - User is authenticated (handled upstream by JwtAuthGuard).
 * - User has a WorkOrderAssignment with status = PENDING for this WorkOrder.
 * - WorkOrder exists and is in a state compatible with acceptance/rejection
 *   (ASSIGNED or ACCEPTED — both mean it was assigned but not yet started).
 *
 * Explicitly does NOT validate:
 * - Active attendance (fichaje).
 * - GPS / physical presence in the building.
 *
 * Reason: cleaners may accept or reject assignments days/weeks before arriving
 * at the building, giving admins time to reassign if needed.
 */
@Injectable()
export class WorkOrderAssignmentGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user: AuthUser;
      params: Record<string, string>;
    }>();

    const user = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const workOrderId = request.params['id'];
    if (!workOrderId) throw new NotFoundException('Work order not found');

    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!workOrder) throw new NotFoundException('Work order not found');

    // Only ASSIGNED status is compatible with a pending acceptance/rejection.
    // ACCEPTED is also allowed in case of re-confirmation edge cases.
    const compatibleStatuses = ['ASSIGNED', 'ACCEPTED'];
    if (!compatibleStatuses.includes(workOrder.status)) {
      throw new ForbiddenException(
        `Work order cannot be accepted or rejected in its current state (${workOrder.status})`,
      );
    }

    const assignment = await this.prisma.workOrderAssignment.findFirst({
      where: {
        workOrderId,
        userId: user.id,
        status: 'PENDING',
      },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'You do not have a pending assignment for this work order',
      );
    }

    return true;
  }
}
