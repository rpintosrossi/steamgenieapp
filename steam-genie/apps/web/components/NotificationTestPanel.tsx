'use client';

import { FormEvent, useState } from 'react';
import { ROLES } from '@steam-genie/shared-constants';
import { api } from '../../lib/api-client';
import { getCurrentUserId, getCurrentUserRole } from '../../lib/auth';

export function NotificationTestPanel() {
  const role = getCurrentUserRole();
  const currentUserId = getCurrentUserId();
  const canTest = role === ROLES.ADMIN || role === ROLES.MANAGER;

  const [title, setTitle] = useState('Prueba Steam Genie');
  const [body, setBody] = useState('Notificación de prueba desde el panel web.');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!canTest) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await api.post<{ queued: boolean; userId: string }>(
        '/notifications/test',
        {
          title: title.trim(),
          body: body.trim(),
          ...(userId.trim() ? { userId: userId.trim() } : {}),
        },
      );
      setSuccess(
        `Notificación encolada para el usuario ${result.userId}. Revisá el celular en unos segundos.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la notificación.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card card--elevated" style={{ marginTop: 24 }}>
      <h2 className="card-title">Notificaciones push</h2>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>
        Enviá una notificación de prueba a un dispositivo móvil con la app instalada y sesión
        iniciada. Si dejás el usuario vacío, se envía a tu propia cuenta
        {currentUserId ? ` (${currentUserId})` : ''}.
      </p>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
        <div className="form-field">
          <label className="form-label" htmlFor="notif-title">Título</label>
          <input
            id="notif-title"
            className="form-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            required
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="notif-body">Mensaje</label>
          <textarea
            id="notif-body"
            className="form-input"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={500}
            rows={3}
            required
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="notif-user">Usuario destino (UUID, opcional)</label>
          <input
            id="notif-user"
            className="form-input"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="Vacío = tu usuario actual"
          />
        </div>

        <div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Enviando…' : 'Enviar notificación de prueba'}
          </button>
        </div>
      </form>
    </section>
  );
}
