import { api } from '../lib/api-client';
import type { TaskCustomField, TaskCustomFieldOption } from './TaskCustomFieldsEditor';

export type TaskCustomFieldDraft = {
  key: string;
  label: string;
  isRequired: boolean;
  showInReport: boolean;
  options: Array<{ key: string; label: string }>;
};

export function newDraftKey() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function validateCustomFieldDraft(draft: TaskCustomFieldDraft): string | null {
  if (!draft.label.trim()) return 'Indicá el nombre del campo.';
  const options = draft.options.map((option) => option.label.trim()).filter(Boolean);
  if (options.length === 0) return 'Agregá al menos una opción a la lista.';
  return null;
}

export async function persistTaskCustomFields(
  taskId: string,
  fields: TaskCustomFieldDraft[],
): Promise<void> {
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const options = field.options
      .map((option, optionIndex) => ({
        label: option.label.trim(),
        sortOrder: optionIndex,
      }))
      .filter((option) => option.label.length > 0);

    const created = await api.post<TaskCustomField>(`/tasks/${taskId}/custom-fields`, {
      label: field.label.trim(),
      fieldType: 'DROPDOWN',
      isRequired: field.isRequired,
      showInReport: field.showInReport,
      sortOrder: index,
    });

    for (const option of options) {
      await api.post<TaskCustomFieldOption>(`/custom-fields/${created.id}/options`, option);
    }
  }
}
