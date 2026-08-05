'use client';

/** JS getDay(): 0=Sun … 6=Sat. Display order Mon→Sun. */
export const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

type WeekdayPickerProps = {
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
};

export function WeekdayPicker({ value, onChange, disabled }: WeekdayPickerProps) {
  function toggle(day: number) {
    if (disabled) return;
    if (value.includes(day)) {
      onChange(value.filter((d) => d !== day));
    } else {
      onChange([...value, day].sort((a, b) => a - b));
    }
  }

  return (
    <div className="form-field">
      <label>Días de la semana *</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {WEEKDAY_OPTIONS.map((opt) => (
          <label key={opt.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={value.includes(opt.value)}
              disabled={disabled}
              onChange={() => toggle(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
      <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
        La tarea solo aparecerá en la app de limpieza estos días.
      </p>
    </div>
  );
}
