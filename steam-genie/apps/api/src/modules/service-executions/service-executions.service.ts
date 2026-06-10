import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TaskExecutionStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MarkTaskDto } from './dto/mark-task.dto';
import type { TaskExecutionItem } from './dto/task-execution-item';
import type { AuthUser } from '@steam-genie/shared-types';

@Injectable()
export class ServiceExecutionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── GET TASKS ────────────────────────────────────────────────────────────
  // IMPORTANT: task marking uses workOrderTaskId (snapshot), never taskId directly.

  async getTasksForExecution(
    serviceExecutionId: string,
    user: AuthUser,
  ): Promise<TaskExecutionItem[]> {
    const se = await this.findServiceExecution(serviceExecutionId);
    await this.assertIsParticipantOrManager(se, user);

    const workOrderTasks = await this.prisma.workOrderTask.findMany({
      where: { workOrderId: se.workOrderId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        nameSnapshot: true,
        sortOrder: true,
        requiresPhotoSnapshot: true,
        allowsObservationSnapshot: true,
        requiresRejectionReasonSnapshot: true,
        taskExecutions: {
          where: { serviceExecutionId },
          select: {
            id: true,
            status: true,
            executedById: true,
            executedBy: { select: { fullName: true } },
            executedAt: true,
            observation: true,
            _count: { select: { photos: true } },
          },
        },
      },
    });

    return workOrderTasks.map((wot) => {
      const exec = wot.taskExecutions[0] ?? null;
      return {
        workOrderTaskId: wot.id,
        nameSnapshot: wot.nameSnapshot,
        sortOrder: wot.sortOrder,
        requiresPhotoSnapshot: wot.requiresPhotoSnapshot,
        allowsObservationSnapshot: wot.allowsObservationSnapshot,
        requiresRejectionReasonSnapshot: wot.requiresRejectionReasonSnapshot,
        execution: exec
          ? {
              id: exec.id,
              status: exec.status,
              executedById: exec.executedById,
              executedByName: exec.executedBy.fullName,
              executedAt: exec.executedAt,
              observation: exec.observation,
              photoCount: exec._count.photos,
            }
          : null,
      };
    });
  }

  // ─── MARK TASK ────────────────────────────────────────────────────────────

  async markTask(
    serviceExecutionId: string,
    workOrderTaskId: string,
    dto: MarkTaskDto,
    user: AuthUser,
  ) {
    const se = await this.findServiceExecution(serviceExecutionId);

    if (se.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        `Service execution is not in progress (current status: ${se.status})`,
      );
    }

    await this.assertIsParticipantOrManager(se, user);

    // Verify workOrderTask belongs to this service execution's work order
    const wot = await this.prisma.workOrderTask.findFirst({
      where: { id: workOrderTaskId, workOrderId: se.workOrderId },
      select: {
        id: true,
        nameSnapshot: true,
        requiresRejectionReasonSnapshot: true,
        allowsObservationSnapshot: true,
      },
    });
    if (!wot) {
      throw new NotFoundException(
        'Work order task not found for this service execution',
      );
    }

    // Rule 13: task already marked — no one can overwrite it
    const existing = await this.prisma.taskExecutionRecord.findUnique({
      where: {
        serviceExecutionId_workOrderTaskId: { serviceExecutionId, workOrderTaskId },
      },
      select: { id: true, executedById: true },
    });
    if (existing) {
      throw new ConflictException(
        'This task has already been marked. The checklist is shared and marks cannot be overwritten.',
      );
    }

    // Validate NOT_DONE + requiresRejectionReasonSnapshot → must provide rejectionReasonId
    if (
      dto.status === TaskExecutionStatus.NOT_DONE &&
      wot.requiresRejectionReasonSnapshot &&
      !dto.rejectionReasonId
    ) {
      throw new UnprocessableEntityException(
        `Task "${wot.nameSnapshot}" requires a rejection reason when marked as NOT_DONE.`,
      );
    }

    // Validate rejectionReasonId type if provided
    if (dto.rejectionReasonId) {
      const reason = await this.prisma.rejectionReason.findFirst({
        where: { id: dto.rejectionReasonId, type: 'TASK_NOT_DONE', isActive: true },
      });
      if (!reason) {
        throw new NotFoundException(
          'Rejection reason not found or not valid for task execution (must be type TASK_NOT_DONE)',
        );
      }
    }

    // Validate observation only allowed when allowsObservationSnapshot = true
    if (dto.observation && !wot.allowsObservationSnapshot) {
      throw new UnprocessableEntityException(
        `Task "${wot.nameSnapshot}" does not allow observations.`,
      );
    }

    const record = await this.prisma.taskExecutionRecord.create({
      data: {
        serviceExecutionId,
        workOrderTaskId,
        status: dto.status,
        rejectionReasonId: dto.rejectionReasonId ?? null,
        observation: dto.observation ?? null,
        executedById: user.id,
        executedAt: new Date(),
      },
    });

    return record;
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  private async findServiceExecution(id: string) {
    const se = await this.prisma.serviceExecution.findFirst({
      where: { id },
      select: {
        id: true,
        workOrderId: true,
        status: true,
        workOrder: { select: { buildingId: true } },
        participants: { select: { userId: true } },
      },
    });
    if (!se) throw new NotFoundException('Service execution not found');
    return se;
  }

  private async assertIsParticipantOrManager(
    se: {
      workOrder: { buildingId: string };
      participants: { userId: string }[];
    },
    user: AuthUser,
  ) {
    const isParticipant = se.participants.some((p) => p.userId === user.id);
    if (isParticipant) return;

    const hasManagerRole = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: user.id,
        role: { name: { in: ['admin', 'manager'] } },
        OR: [
          { buildingId: null },
          { buildingId: se.workOrder.buildingId },
        ],
      },
    });
    if (!hasManagerRole) {
      throw new ForbiddenException(
        'You must be a participant in this execution or have a manager/admin role to access it',
      );
    }
  }
}
