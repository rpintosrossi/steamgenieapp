'use client';

import { useState } from 'react';
import {
  newDraftKey,
  validateCustomFieldDraft,
  type TaskCustomFieldDraft,
} from '../lib/task-custom-fields';
import {
  CustomFieldDraftOptionsEditor,
  CustomFieldFlagToggles,
  CustomFieldFormPanel,
  CustomFieldSummaryCard,
  CustomFieldsEmpty,
  CustomFieldsHeader,
  CustomFieldsSection,
} from './TaskCustomFieldsShared';

type TaskCustomFieldsDraftEditorProps = {
  fields: TaskCustomFieldDraft[];
  onChange: (fields: TaskCustomFieldDraft[]) => void;
};

export function TaskCustomFieldsDraftEditor({
  fields,
  onChange,
}: TaskCustomFieldsDraftEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskCustomFieldDraft | null>(null);

  function startDraft() {
    setDraft({
      key: newDraftKey(),
      label: '',
      isRequired: false,
      showInReport: false,
      options: [{ key: newDraftKey(), label: '' }],
    });
    setError(null);
  }

  function cancelDraft() {
    setDraft(null);
    setError(null);
  }

  function addDraftToList() {
    if (!draft) return;

    const validationError = validateCustomFieldDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    onChange([...fields, draft]);
    setDraft(null);
    setError(null);
  }

  function removeField(key: string) {
    onChange(fields.filter((field) => field.key !== key));
  }

  return (
    <CustomFieldsSection>
      <CustomFieldsHeader onAdd={startDraft} showAddButton={!draft} />

      {error ? <div className="alert alert-error">{error}</div> : null}

      {fields.length === 0 && !draft ? <CustomFieldsEmpty optional /> : null}

      {fields.map((field) => (
        <CustomFieldSummaryCard
          key={field.key}
          label={field.label}
          isRequired={field.isRequired}
          showInReport={field.showInReport}
          optionLabels={field.options.map((option) => option.label.trim()).filter(Boolean)}
          onRemove={() => removeField(field.key)}
        />
      ))}

      {draft ? (
        <CustomFieldFormPanel
          title="Nuevo campo — Lista desplegable"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={cancelDraft}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={addDraftToList}>
                Agregar a la lista
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
                options: [...draft.options, { key: newDraftKey(), label: '' }],
              })
            }
          />
        </CustomFieldFormPanel>
      ) : null}
    </CustomFieldsSection>
  );
}
