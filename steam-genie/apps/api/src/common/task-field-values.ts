import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { TaskExecutionStatus, type Prisma } from '@prisma/client';

export type TaskFieldValueInput = {
  fieldId: string;
  selectedOptionIds: string[];
};

export type TaskFieldDefinition = {
  id: string;
  label: string;
  isRequired: boolean;
  options: Array<{ id: string; label: string }>;
};

export function validateTaskFieldValues(
  fields: TaskFieldDefinition[],
  fieldValues: TaskFieldValueInput[] | undefined,
  status: TaskExecutionStatus,
): void {
  const valuesByFieldId = new Map(
    (fieldValues ?? []).map((value) => [value.fieldId, value.selectedOptionIds]),
  );
  const optionIdsByField = new Map(
    fields.map((field) => [field.id, new Set(field.options.map((option) => option.id))]),
  );

  if (status === TaskExecutionStatus.DONE) {
    for (const field of fields) {
      if (!field.isRequired) continue;
      const selected = valuesByFieldId.get(field.id) ?? [];
      if (selected.length === 0) {
        throw new UnprocessableEntityException(
          `El campo "${field.label}" es obligatorio.`,
        );
      }
    }
  }

  for (const value of fieldValues ?? []) {
    const validOptions = optionIdsByField.get(value.fieldId);
    if (!validOptions) {
      throw new BadRequestException(`Campo desconocido: ${value.fieldId}`);
    }

    for (const optionId of value.selectedOptionIds) {
      if (!validOptions.has(optionId)) {
        throw new BadRequestException(
          `La opción ${optionId} no pertenece al campo ${value.fieldId}`,
        );
      }
    }
  }
}

export async function upsertTaskFieldValues(
  tx: Prisma.TransactionClient,
  taskExecutionId: string,
  fieldValues: TaskFieldValueInput[] | undefined,
  mode: 'snapshot' | 'master',
): Promise<void> {
  await tx.taskExecutionFieldValue.deleteMany({ where: { taskExecutionId } });

  if (!fieldValues?.length) return;

  await tx.taskExecutionFieldValue.createMany({
    data: fieldValues.map((value) => ({
      taskExecutionId,
      selectedOptionIds: value.selectedOptionIds,
      ...(mode === 'snapshot'
        ? { snapshotFieldId: value.fieldId }
        : { masterFieldId: value.fieldId }),
    })),
  });
}
