'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import { buildInitialRoles } from './BuildingCheckboxGrid';
import { ROLE_LABELS } from '../lib/labels';
import type { RoleItem } from '../lib/types';

interface CreateUserModalProps {
  roles: RoleItem[];
  onClose: () => void;
  onCreated: () => void;
}

export function CreateUserModal({ roles, onClose, onCreated }: CreateUserModalProps) {
  const [dni, setDni] = useState('');
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [roleId, setRoleId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const defaultRole = roles.find((role) => role.name === 'cleaner') ?? roles[0];
    if (defaultRole) setRoleId(defaultRole.id);
  }, [roles]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      await api.post('/users', {
        dni,
        fullName,
        birthDate: birthDate || undefined,
        isActive: true,
        initialRoles: buildInitialRoles(roleId, []),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Nuevo usuario</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Después de crear el usuario podés asignarle edificios desde el listado.
        </p>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form onSubmit={handleSubmit} className="stack">
          <div className="grid-2">
            <div className="form-field">
              <label>DNI *</label>
              <input
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
              />
            </div>
            <div className="form-field">
              <label>Nombre completo *</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="form-field">
              <label>Fecha de nacimiento</label>
              <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Rol inicial</label>
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {ROLE_LABELS[role.name] ?? role.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="muted">
            La contraseña inicial es la fecha de nacimiento (DDMMYYYY) o 01012000 si no tiene fecha.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creando…' : 'Crear usuario'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
