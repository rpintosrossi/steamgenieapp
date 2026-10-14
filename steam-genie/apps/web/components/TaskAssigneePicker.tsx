'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';

type AssignablePerson = {
  id: string;
  fullName: string;
  assignableRole: 'manager' | 'cleaner' | string;
};

type AssignableCleanersResponse = {
  cleaners: AssignablePerson[];
};

const ROLE_LABEL: Record<string, string> = {
  manager: 'Encargado',
  cleaner: 'Operario',
};

type TaskAssigneePickerProps = {
  buildingId: string;
  value: string[];
  onChange: (userIds: string[]) => void;
};

export function TaskAssigneePicker({ buildingId, value, onChange }: TaskAssigneePickerProps) {
  const [people, setPeople] = useState<AssignablePerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!buildingId) {
      setPeople([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<AssignableCleanersResponse>(`/buildings/${buildingId}/assignable-cleaners`)
      .then((data) => {
        if (!cancelled) setPeople(data.cleaners ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPeople([]);
          setError(err instanceof Error ? err.message : 'No se pudo cargar el personal');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildingId]);

  function toggle(userId: string) {
    if (value.includes(userId)) {
      onChange(value.filter((id) => id !== userId));
      return;
    }
    onChange([...value, userId]);
  }

  return (
    <div className="form-field">
      <label>Personas (opcional)</label>
      <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
        Si no elegís a nadie, la tarea la ve todo el equipo. Si elegís personas, solo ellas la ven
        en la app, con la indicación de que está asignada a su usuario. El encargado puede
        completarla y ve a quién está destinada.
      </p>

      {!buildingId ? (
        <p className="muted" style={{ margin: 0 }}>
          Seleccioná un edificio para elegir personas.
        </p>
      ) : loading ? (
        <p className="muted" style={{ margin: 0 }}>
          Cargando personal…
        </p>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : people.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No hay operarios ni encargados activos.
        </p>
      ) : (
        <div
          style={{
            maxHeight: 200,
            overflow: 'auto',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 8,
            padding: '8px 12px',
          }}
        >
          {people.map((person) => (
            <label
              key={person.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
            >
              <input
                type="checkbox"
                checked={value.includes(person.id)}
                onChange={() => toggle(person.id)}
              />
              <span>
                {person.fullName}{' '}
                <span className="muted">
                  ({ROLE_LABEL[person.assignableRole] ?? person.assignableRole})
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
