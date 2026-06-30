import type { Prisma, TaskFieldType } from '@prisma/client';

export type EventualTaskForSnapshot = {
  id: string;
  name: string;
  requiresPhoto: boolean;
  allowsObservation: boolean;
  requiresRejectionReason: boolean;
  customFields: Array<{
    id: string;
    label: string;
    fieldType: TaskFieldType;
    isRequired: boolean;
    showInReport: boolean;
    sortOrder: number;
    options: Array<{ id: string; label: string; sortOrder: number }>;
  }>;
};

/** Snapshot batch de tareas EVENTUAL → work_order_tasks (+ campos y opciones). */
export async function snapshotEventualTasks(
  tx: Prisma.TransactionClient,
  workOrderId: string,
  eventualTasks: EventualTaskForSnapshot[],
): Promise<void> {
  if (eventualTasks.length === 0) return;

  await tx.workOrderTask.createMany({
    data: eventualTasks.map((task, index) => ({
      workOrderId,
      taskId: task.id,
      nameSnapshot: task.name,
      requiresPhotoSnapshot: task.requiresPhoto,
      allowsObservationSnapshot: task.allowsObservation,
      requiresRejectionReasonSnapshot: task.requiresRejectionReason,
      sortOrder: index,
    })),
  });

  const createdTasks = await tx.workOrderTask.findMany({
    where: { workOrderId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, sortOrder: true },
  });

  const fieldPayload: Array<{
    workOrderTaskId: string;
    originalFieldId: string;
    labelSnapshot: string;
    fieldType: TaskFieldType;
    isRequired: boolean;
    showInReport: boolean;
    sortOrder: number;
  }> = [];

  for (let taskIndex = 0; taskIndex < eventualTasks.length; taskIndex += 1) {
    const workOrderTaskId = createdTasks[taskIndex]?.id;
    if (!workOrderTaskId) continue;

    for (const field of eventualTasks[taskIndex].customFields) {
      fieldPayload.push({
        workOrderTaskId,
        originalFieldId: field.id,
        labelSnapshot: field.label,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        showInReport: field.showInReport,
        sortOrder: field.sortOrder,
      });
    }
  }

  if (fieldPayload.length > 0) {
    await tx.workOrderTaskCustomField.createMany({ data: fieldPayload });
  }

  const createdFields = await tx.workOrderTaskCustomField.findMany({
    where: { workOrderTask: { workOrderId } },
    select: { id: true, workOrderTaskId: true, originalFieldId: true },
  });

  const fieldIdByKey = new Map(
    createdFields.map((field) => [`${field.workOrderTaskId}:${field.originalFieldId}`, field.id]),
  );

  const optionPayload: Array<{
    workOrderTaskFieldId: string;
    originalOptionId: string;
    labelSnapshot: string;
    sortOrder: number;
  }> = [];

  for (let taskIndex = 0; taskIndex < eventualTasks.length; taskIndex += 1) {
    const workOrderTaskId = createdTasks[taskIndex]?.id;
    if (!workOrderTaskId) continue;

    for (const field of eventualTasks[taskIndex].customFields) {
      const snapshotFieldId = fieldIdByKey.get(`${workOrderTaskId}:${field.id}`);
      if (!snapshotFieldId) continue;

      for (const option of field.options) {
        optionPayload.push({
          workOrderTaskFieldId: snapshotFieldId,
          originalOptionId: option.id,
          labelSnapshot: option.label,
          sortOrder: option.sortOrder,
        });
      }
    }
  }

  if (optionPayload.length > 0) {
    await tx.workOrderTaskCustomFieldOption.createMany({ data: optionPayload });
  }
}
