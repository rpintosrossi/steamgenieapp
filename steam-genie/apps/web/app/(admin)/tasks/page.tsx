'use client';

import { FormEvent, useEffect, useState } from 'react';
import { TASK_FREQUENCIES } from '@steam-genie/shared-constants';
import { LocationPicker } from '../../../components/LocationPicker';
import { api } from '../../../lib/api-client';
import { TASK_FREQUENCY_LABELS } from '../../../lib/labels';
import type { Paginated, TaskItem } from '../../../lib/types';

export default function TasksPage() {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [location, setLocation] = useState({
    buildingId: '',
    floorId: '',
    zoneId: '',
    subzoneId: '',
  });
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<string>(TASK_FREQUENCIES.EVENTUAL);
  const [requiresPhoto, setRequiresPhoto] = useState(false);
  const [allowsObservation, setAllowsObservation] = useState(true);
  const [requiresRejectionReason, setRequiresRejectionReason] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Paginated<TaskItem>>('/tasks?limit=100&includeEventual=true');
      setItems(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar tareas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!location.buildingId || !location.zoneId) {
      setError('Seleccioná edificio y zona.');
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/tasks', {
        buildingId: location.buildingId,
        zoneId: location.zoneId,
        subzoneId: location.subzoneId || undefined,
        name,
        frequency,
        requiresPhoto,
        allowsObservation,
        requiresRejectionReason,
        isActive: true,
      });
      setName('');
      setSuccess('Tarea creada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la tarea');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Tareas</h1>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        <h2 className="card-title">Nueva tarea</h2>
        <p className="muted">
          Las tareas <strong>Eventual (checkout)</strong> se usan al crear reservas. Las demás son periódicas.
        </p>
        <form onSubmit={handleCreate} className="stack">
          <LocationPicker value={location} onChange={setLocation} />

          <div className="grid-2">
            <div className="form-field">
              <label>Nombre *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-field">
              <label>Frecuencia *</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                {Object.values(TASK_FREQUENCIES).map((f) => (
                  <option key={f} value={f}>
                    {TASK_FREQUENCY_LABELS[f] ?? f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-3">
            <label><input type="checkbox" checked={requiresPhoto} onChange={(e) => setRequiresPhoto(e.target.checked)} /> Requiere foto</label>
            <label><input type="checkbox" checked={allowsObservation} onChange={(e) => setAllowsObservation(e.target.checked)} /> Permite observación</label>
            <label><input type="checkbox" checked={requiresRejectionReason} onChange={(e) => setRequiresRejectionReason(e.target.checked)} /> Motivo si no se hace</label>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creando…' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card-title">Listado</h2>
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Frecuencia</th>
                <th>Foto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((task) => (
                <tr key={task.id}>
                  <td>{task.name}</td>
                  <td>{TASK_FREQUENCY_LABELS[task.frequency] ?? task.frequency}</td>
                  <td>{task.requiresPhoto ? 'Sí' : 'No'}</td>
                  <td>
                    <span className={`badge ${task.isActive ? 'badge-success' : ''}`}>
                      {task.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
