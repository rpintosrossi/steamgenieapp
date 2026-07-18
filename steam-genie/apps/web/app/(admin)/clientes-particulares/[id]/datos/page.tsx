'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../../../lib/api-client';
import type { ParticularClientItem } from '../../../../../lib/types';
import { useParticularClientDetail } from '../ParticularClientDetailContext';

export default function ParticularClientDatosPage() {
  const { client, setClient, setError, setSuccess } = useParticularClientDetail();
  const [name, setName] = useState(client.name);
  const [taxId, setTaxId] = useState(client.taxId ?? '');
  const [contactName, setContactName] = useState(client.contactName ?? '');
  const [email, setEmail] = useState(client.email ?? '');
  const [phone, setPhone] = useState(client.phone ?? '');
  const [notes, setNotes] = useState(client.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(client.name);
    setTaxId(client.taxId ?? '');
    setContactName(client.contactName ?? '');
    setEmail(client.email ?? '');
    setPhone(client.phone ?? '');
    setNotes(client.notes ?? '');
  }, [client]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.patch<ParticularClientItem>(`/particular-clients/${client.id}`, {
        name: name.trim(),
        taxId: taxId.trim() || null,
        contactName: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      });
      setClient(updated);
      setSuccess('Datos actualizados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <form onSubmit={handleSubmit} className="stack">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="pc-name">Nombre / Razón social *</label>
            <input
              id="pc-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
            />
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="pc-tax">CUIT</label>
            <input
              id="pc-tax"
              className="input"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              maxLength={20}
            />
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="pc-contact">Contacto</label>
            <input
              id="pc-contact"
              className="input"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="pc-email">Correo</label>
            <input
              id="pc-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="pc-phone">Teléfono</label>
            <input
              id="pc-phone"
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={50}
            />
          </div>
          <div className="form-field" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <label htmlFor="pc-notes">Notas</label>
            <textarea
              id="pc-notes"
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              rows={3}
            />
          </div>
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar datos'}
          </button>
        </div>
      </form>
    </div>
  );
}
