'use client';

import type { ReactNode } from 'react';

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function CustomFieldsSection({ children }: { children: ReactNode }) {
  return <section className="custom-fields-section">{children}</section>;
}

export function CustomFieldsHeader({
  onAdd,
  showAddButton = true,
}: {
  onAdd?: () => void;
  showAddButton?: boolean;
}) {
  return (
    <div className="custom-fields-header">
      <div className="custom-fields-header-main">
        <div className="custom-fields-header-icon" aria-hidden>
          <LayersIcon />
        </div>
        <div>
          <h3>Campos personalizados</h3>
          <p>Lista desplegable con selección múltiple al fichar la tarea.</p>
        </div>
      </div>
      {showAddButton && onAdd ? (
        <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>
          <PlusIcon />
          Agregar campo
        </button>
      ) : null}
    </div>
  );
}

export function CustomFieldsEmpty({ optional = false }: { optional?: boolean }) {
  return (
    <div className="custom-fields-empty">
      <div className="custom-fields-empty-icon" aria-hidden>
        <ListIcon />
      </div>
      <strong>Sin campos configurados</strong>
      <span>
        {optional
          ? 'Podés agregar listas desplegables opcionales para completar al fichar.'
          : 'Agregá una lista desplegable para que el personal complete al fichar.'}
      </span>
    </div>
  );
}

export function CustomFieldMetaBadges({
  isRequired,
  showInReport,
}: {
  isRequired: boolean;
  showInReport: boolean;
}) {
  return (
    <div className="custom-field-card-badges">
      <span className="badge badge-primary">Lista desplegable</span>
      {isRequired ? <span className="badge badge-warning">Obligatorio</span> : null}
      {showInReport ? <span className="badge badge-success">En reporte</span> : null}
    </div>
  );
}

export function CustomFieldOptionChips({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="custom-field-chips">
      {labels.map((label) => (
        <span key={label} className="custom-field-chip">
          {label}
        </span>
      ))}
    </div>
  );
}

export function CustomFieldFlagToggles({
  isRequired,
  showInReport,
  disabled = false,
  onChange,
}: {
  isRequired: boolean;
  showInReport: boolean;
  disabled?: boolean;
  onChange: (patch: { isRequired?: boolean; showInReport?: boolean }) => void;
}) {
  return (
    <div className="custom-field-toggle-grid">
      <label className={`custom-field-toggle${isRequired ? ' is-active' : ''}`}>
        <input
          type="checkbox"
          checked={isRequired}
          disabled={disabled}
          onChange={(e) => onChange({ isRequired: e.target.checked })}
        />
        <span className="custom-field-toggle-text">
          <strong>Obligatorio al fichar</strong>
          <span>Debe elegir al menos una opción para marcar la tarea.</span>
        </span>
      </label>
      <label className={`custom-field-toggle${showInReport ? ' is-active' : ''}`}>
        <input
          type="checkbox"
          checked={showInReport}
          disabled={disabled}
          onChange={(e) => onChange({ showInReport: e.target.checked })}
        />
        <span className="custom-field-toggle-text">
          <strong>Mostrar en reporte</strong>
          <span>Aparece en el reporte final del servicio.</span>
        </span>
      </label>
    </div>
  );
}

type DraftOptionRow = {
  key: string;
  label: string;
};

export function CustomFieldDraftOptionsEditor({
  options,
  onChange,
  onRemove,
  onAdd,
}: {
  options: DraftOptionRow[];
  onChange: (index: number, label: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="custom-field-options-block">
      <label className="custom-field-options-label">Opciones de la lista *</label>
      {options.map((option, index) => (
        <div key={option.key} className="custom-field-option-row">
          <span className="custom-field-option-index">{index + 1}</span>
          <input
            value={option.label}
            onChange={(e) => onChange(index, e.target.value)}
            placeholder={`Opción ${index + 1}`}
          />
          {options.length > 1 ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onRemove(index)}
              aria-label={`Quitar opción ${index + 1}`}
            >
              Quitar
            </button>
          ) : null}
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={onAdd}>
        <PlusIcon />
        Agregar opción
      </button>
    </div>
  );
}

export function CustomFieldFormPanel({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="custom-field-form-panel">
      <div className="custom-field-form-panel-head">
        <ListIcon />
        <h4>{title}</h4>
      </div>
      <div className="custom-field-form-panel-body">{children}</div>
      <div className="form-actions" style={{ padding: '0 18px 18px' }}>
        {footer}
      </div>
    </div>
  );
}

export function CustomFieldSummaryCard({
  label,
  isRequired,
  showInReport,
  optionLabels,
  onRemove,
  removeLabel = 'Quitar',
  disabled = false,
}: {
  label: string;
  isRequired: boolean;
  showInReport: boolean;
  optionLabels: string[];
  onRemove: () => void;
  removeLabel?: string;
  disabled?: boolean;
}) {
  return (
    <article className="custom-field-card">
      <div className="custom-field-card-head">
        <div>
          <h4 className="custom-field-card-title">{label}</h4>
          <CustomFieldMetaBadges isRequired={isRequired} showInReport={showInReport} />
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onRemove}
          disabled={disabled}
        >
          {removeLabel}
        </button>
      </div>
      <div className="custom-field-card-body">
        <CustomFieldOptionChips labels={optionLabels} />
      </div>
    </article>
  );
}

export function CustomFieldPersistedCard({
  label,
  isRequired,
  showInReport,
  disabled,
  onUpdate,
  onRemove,
  children,
}: {
  label: string;
  isRequired: boolean;
  showInReport: boolean;
  disabled?: boolean;
  onUpdate: (patch: { isRequired?: boolean; showInReport?: boolean }) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <article className="custom-field-card">
      <div className="custom-field-card-head">
        <div>
          <h4 className="custom-field-card-title">{label}</h4>
          <CustomFieldMetaBadges isRequired={isRequired} showInReport={showInReport} />
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onRemove}
          disabled={disabled}
        >
          Eliminar
        </button>
      </div>
      <div className="custom-field-card-body">
        <CustomFieldFlagToggles
          isRequired={isRequired}
          showInReport={showInReport}
          disabled={disabled}
          onChange={onUpdate}
        />
        {children}
      </div>
    </article>
  );
}

export function CustomFieldPersistedOptions({
  options,
  disabled,
  optionSavingId,
  canRemove,
  onUpdate,
  onRemove,
  onAdd,
}: {
  options: Array<{ id: string; label: string }>;
  disabled?: boolean;
  optionSavingId: string | null;
  canRemove: boolean;
  onUpdate: (id: string, label: string) => void;
  onRemove: (id: string) => void;
  onAdd: (label: string) => void;
}) {
  return (
    <div className="custom-field-options-block">
      <label className="custom-field-options-label">Opciones</label>
      {options.map((option, index) => (
        <div key={option.id} className="custom-field-option-row">
          <span className="custom-field-option-index">{index + 1}</span>
          <input
            defaultValue={option.label}
            disabled={disabled || optionSavingId === option.id}
            onBlur={(e) => onUpdate(option.id, e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={disabled || optionSavingId === option.id || !canRemove}
            onClick={() => onRemove(option.id)}
          >
            Quitar
          </button>
        </div>
      ))}
      <AddOptionForm disabled={disabled} onAdd={onAdd} />
    </div>
  );
}

function AddOptionForm({
  disabled,
  onAdd,
}: {
  disabled?: boolean;
  onAdd: (label: string) => void;
}) {
  return (
    <div className="inline-form">
      <div className="custom-field-option-row" style={{ width: '100%' }}>
        <span className="custom-field-option-index" style={{ visibility: 'hidden' }}>
          +
        </span>
        <input
          id="custom-field-new-option"
          placeholder="Nueva opción"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const value = e.currentTarget.value;
            if (!value.trim()) return;
            onAdd(value);
            e.currentTarget.value = '';
          }}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled}
          onClick={(e) => {
            const input = (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null);
            if (!input?.value.trim()) return;
            onAdd(input.value);
            input.value = '';
          }}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}
