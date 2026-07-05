'use client';

import { useState } from 'react';
import { api } from '../lib/api-client';
import {
  CustomFieldDraftOptionsEditor,
  CustomFieldFlagToggles,
  CustomFieldFormPanel,
  CustomFieldPersistedCard,
  CustomFieldPersistedOptions,
  CustomFieldsEmpty,
  CustomFieldsHeader,
  CustomFieldsSection,
} from './TaskCustomFieldsShared';

export type TaskCustomFieldOption = {
  id: string;
  label: string;
  sortOrder: number;
};

export type TaskCustomField = {
  id: string;
  label: string;
  fieldType: 'DROPDOWN';
  isRequired: boolean;
  showInReport: boolean;
  sortOrder: number;
  options: TaskCustomFieldOption[];
};

type TaskCustomFieldsEditorProps = {
  taskId: string;
  fields: TaskCustomField[];
  onChange: (fields: TaskCustomField[]) => void;
};

type DraftOption = {
  key: string;
  label: string;
};

type DraftField = {
  key: string;
  label: string;
  isRequired: boolean;
  showInReport: boolean;
  options: DraftOption[];
};

function newKey() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function TaskCustomFieldsEditor({
  taskId,
  fields,
  onChange,
}: TaskCustomFieldsEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [savingFieldKey, setSavingFieldKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftField | null>(null);

  function startDraft() {
    setDraft({
      key: newKey(),
      label: '',
      isRequired: false,
      showInReport: false,
      options: [{ key: newKey(), label: '' }],
    });
    setError(null);
  }

  function cancelDraft() {
    setDraft(null);
    setError(null);
  }

  async function saveDraft() {
    if (!draft) return;

    const label = draft.label.trim();
    if (!label) {
      setError('Indicá el nombre del campo.');
      return;
    }

    const options = draft.options
      .map((option, index) => ({
        label: option.label.trim(),
        sortOrder: index,
      }))
      .filter((option) => option.label.length > 0);

    if (options.length === 0) {
      setError('Agregá al menos una opción a la lista.');
      return;
    }

    setSavingFieldKey(draft.key);
    setError(null);

    try {
      const created = await api.post<TaskCustomField>(`/tasks/${taskId}/custom-fields`, {
        label,
        fieldType: 'DROPDOWN',
        isRequired: draft.isRequired,
        showInReport: draft.showInReport,
        sortOrder: fields.length,
      });

      const createdOptions: TaskCustomFieldOption[] = [];
      for (const option of options) {
        const createdOption = await api.post<TaskCustomFieldOption>(
          `/custom-fields/${created.id}/options`,
          option,
        );
        createdOptions.push(createdOption);
      }

      onChange([
        ...fields,
        {
          ...created,
          fieldType: 'DROPDOWN',
          options: createdOptions,
        },
      ]);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el campo');
    } finally {
      setSavingFieldKey(null);
    }
  }

  async function updateField(field: TaskCustomField, patch: Partial<TaskCustomField>) {
    setSavingFieldKey(field.id);
    setError(null);
    try {
      const updated = await api.patch<TaskCustomField>(`/custom-fields/${field.id}`, patch);
      onChange(
        fields.map((item) =>
          item.id === field.id
            ? {
                ...item,
                ...updated,
                options: item.options,
              }
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el campo');
    } finally {
      setSavingFieldKey(null);
    }
  }

  async function removeField(fieldId: string) {
    if (!window.confirm('¿Eliminar este campo personalizado?')) return;

    setSavingFieldKey(fieldId);
    setError(null);
    try {
      await api.delete(`/custom-fields/${fieldId}`);
      onChange(fields.filter((field) => field.id !== fieldId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el campo');
    } finally {
      setSavingFieldKey(null);
    }
  }

  async function addOption(field: TaskCustomField, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;

    setSavingFieldKey(field.id);
    setError(null);
    try {
      const created = await api.post<TaskCustomFieldOption>(`/custom-fields/${field.id}/options`, {
        label: trimmed,
        sortOrder: field.options.length,
      });
      onChange(
        fields.map((item) =>
          item.id === field.id ? { ...item, options: [...item.options, created] } : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar la opción');
    } finally {
      setSavingFieldKey(null);
    }
  }

  async function updateOption(field: TaskCustomField, optionId: string, label: string) {
    const option = field.options.find((item) => item.id === optionId);
    if (!option) return;

    const trimmed = label.trim();
    if (!trimmed || trimmed === option.label) return;

    setSavingFieldKey(option.id);
    setError(null);
    try {
      const updated = await api.patch<TaskCustomFieldOption>(
        `/custom-field-options/${option.id}`,
        { label: trimmed },
      );
      onChange(
        fields.map((item) =>
          item.id === field.id
            ? {
                ...item,
                options: item.options.map((opt) => (opt.id === option.id ? updated : opt)),
              }
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la opción');
    } finally {
      setSavingFieldKey(null);
    }
  }

  async function removeOption(field: TaskCustomField, optionId: string) {
    if (!window.confirm('¿Eliminar esta opción?')) return;

    setSavingFieldKey(optionId);
    setError(null);
    try {
      await api.delete(`/custom-field-options/${optionId}`);
      onChange(
        fields.map((item) =>
          item.id === field.id
            ? { ...item, options: item.options.filter((opt) => opt.id !== optionId) }
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la opción');
    } finally {
      setSavingFieldKey(null);
    }
  }

  return (
    <CustomFieldsSection>
      <CustomFieldsHeader onAdd={startDraft} showAddButton={!draft} />

      {error ? <div className="alert alert-error">{error}</div> : null}

      {fields.length === 0 && !draft ? <CustomFieldsEmpty /> : null}

      {fields.map((field) => (
        <CustomFieldPersistedCard
          key={field.id}
          label={field.label}
          isRequired={field.isRequired}
          showInReport={field.showInReport}
          disabled={savingFieldKey === field.id}
          onUpdate={(patch) => void updateField(field, patch)}
          onRemove={() => void removeField(field.id)}
        >
          <CustomFieldPersistedOptions
            options={field.options}
            disabled={savingFieldKey === field.id}
            optionSavingId={savingFieldKey}
            canRemove={field.options.length > 1}
            onUpdate={(optionId, label) => void updateOption(field, optionId, label)}
            onRemove={(optionId) => void removeOption(field, optionId)}
            onAdd={(label) => void addOption(field, label)}
          />
        </CustomFieldPersistedCard>
      ))}

      {draft ? (
        <CustomFieldFormPanel
          title="Nuevo campo — Lista desplegable"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={cancelDraft}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingFieldKey === draft.key}
                onClick={() => void saveDraft()}
              >
                {savingFieldKey === draft.key ? 'Guardando…' : 'Guardar campo'}
              </button>
            </>
          }
        >
          <div className="form-field">
            <label>Nombre del campo *</label>
            <input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Ej: Productos utilizados"
              autoFocus
            />
          </div>

          <CustomFieldFlagToggles
            isRequired={draft.isRequired}
            showInReport={draft.showInReport}
            onChange={(patch) => setDraft({ ...draft, ...patch })}
          />

          <CustomFieldDraftOptionsEditor
            options={draft.options}
            onChange={(index, label) =>
              setDraft({
                ...draft,
                options: draft.options.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, label } : item,
                ),
              })
            }
            onRemove={(index) =>
              setDraft({
                ...draft,
                options: draft.options.filter((_, itemIndex) => itemIndex !== index),
              })
            }
            onAdd={() =>
              setDraft({
                ...draft,
                options: [...draft.options, { key: newKey(), label: '' }],
              })
            }
          />
        </CustomFieldFormPanel>
      ) : null}
    </CustomFieldsSection>
  );
}
