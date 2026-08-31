import type { Prisma, TaskFieldType } from '@prisma/client';

export type EventualTaskForSnapshot = {
  id: string;
  name: string;
  allowsPhoto: boolean;
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
      allowsPhotoSnapshot: task.allowsPhoto || task.requiresPhoto,
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

/** Copia el checklist (tareas + campos custom) de un servicio a otro. */
export async function cloneWorkOrderTasks(
  tx: Prisma.TransactionClient,
  sourceWorkOrderId: string,
  targetWorkOrderId: string,
): Promise<number> {
  const sourceTasks = await tx.workOrderTask.findMany({
    where: { workOrderId: sourceWorkOrderId },
    orderBy: { sortOrder: 'asc' },
    include: {
      customFieldSnapshots: {
        include: { optionSnapshots: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (sourceTasks.length === 0) return 0;

  const originalFieldIds = [
    ...new Set(
      sourceTasks.flatMap((task) =>
        task.customFieldSnapshots.map((field) => field.originalFieldId),
      ),
    ),
  ];
  const originalOptionIds = [
    ...new Set(
      sourceTasks.flatMap((task) =>
        task.customFieldSnapshots.flatMap((field) =>
          field.optionSnapshots.map((option) => option.originalOptionId),
        ),
      ),
    ),
  ];
  const masterTaskIds = [
    ...new Set(
      sourceTasks
        .map((task) => task.taskId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [existingFields, existingOptions, existingMasterTasks] = await Promise.all([
    originalFieldIds.length > 0
      ? tx.taskCustomField.findMany({
          where: { id: { in: originalFieldIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    originalOptionIds.length > 0
      ? tx.taskCustomFieldOption.findMany({
          where: { id: { in: originalOptionIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    masterTaskIds.length > 0
      ? tx.task.findMany({
          where: { id: { in: masterTaskIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const validFieldIds = new Set(existingFields.map((field) => field.id));
  const validOptionIds = new Set(existingOptions.map((option) => option.id));
  const validTaskIds = new Set(existingMasterTasks.map((task) => task.id));

  for (const task of sourceTasks) {
    const created = await tx.workOrderTask.create({
      data: {
        workOrderId: targetWorkOrderId,
        taskId: task.taskId && validTaskIds.has(task.taskId) ? task.taskId : null,
        nameSnapshot: task.nameSnapshot,
        allowsPhotoSnapshot: task.allowsPhotoSnapshot,
        requiresPhotoSnapshot: task.requiresPhotoSnapshot,
        allowsObservationSnapshot: task.allowsObservationSnapshot,
        requiresRejectionReasonSnapshot: task.requiresRejectionReasonSnapshot,
        sortOrder: task.sortOrder,
      },
    });

    for (const field of task.customFieldSnapshots) {
      if (!validFieldIds.has(field.originalFieldId)) continue;

      const createdField = await tx.workOrderTaskCustomField.create({
        data: {
          workOrderTaskId: created.id,
          originalFieldId: field.originalFieldId,
          labelSnapshot: field.labelSnapshot,
          fieldType: field.fieldType,
          isRequired: field.isRequired,
          showInReport: field.showInReport,
          sortOrder: field.sortOrder,
        },
      });

      const options = field.optionSnapshots.filter((option) =>
        validOptionIds.has(option.originalOptionId),
      );
      if (options.length === 0) continue;

      await tx.workOrderTaskCustomFieldOption.createMany({
        data: options.map((option) => ({
          workOrderTaskFieldId: createdField.id,
          originalOptionId: option.originalOptionId,
          labelSnapshot: option.labelSnapshot,
          sortOrder: option.sortOrder,
        })),
      });
    }
  }

  return sourceTasks.length;
}
