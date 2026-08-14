'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../../../lib/api-client';
import type { ParticularClientItem, QuoteBranchItem } from '../../../../../lib/types';
import { useParticularClientDetail } from '../ParticularClientDetailContext';

export default function ParticularClientDatosPage() {
  const { client, setClient, setError, setSuccess } = useParticularClientDetail();
  const [name, setName] = useState(client.name);
  const [taxId, setTaxId] = useState(client.taxId ?? '');
  const [contactName, setContactName] = useState(client.contactName ?? '');
  const [email, setEmail] = useState(client.email ?? '');
  const [phone, setPhone] = useState(client.phone ?? '');
  const [notes, setNotes] = useState(client.notes ?? '');
  const [branchId, setBranchId] = useState(client.branchId ?? client.branch?.id ?? '');
  const [branches, setBranches] = useState<QuoteBranchItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(client.name);
    setTaxId(client.taxId ?? '');
    setContactName(client.contactName ?? '');
    setEmail(client.email ?? '');
    setPhone(client.phone ?? '');
    setNotes(client.notes ?? '');
    setBranchId(client.branchId ?? client.branch?.id ?? '');
  }, [client]);

  useEffect(() => {
    void api
      .get<QuoteBranchItem[]>('/quote-branches?includeInactive=false')
      .then((rows) => {
        const current = client.branch;
        const list =
          current && !rows.some((row) => row.id === current.id)
            ? [current, ...rows]
            : rows;
        setBranches(list);
      })
      .catch(() => setBranches([]));
  }, [client.branch]);

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
        ...(branchId ? { branchId } : {}),
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
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="pc-branch">Sucursal *</label>
            {branches.length === 0 ? (
              <p className="muted" style={{ margin: '8px 0 0' }}>
                No hay sucursales. Crealas en{' '}
                <Link href="/configuracion/sucursales">Configuración</Link>.
              </p>
            ) : (
              <select
                id="pc-branch"
                className="input"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                required
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                    {branch.isDefault ? ' (predeterminada)' : ''}
                  </option>
                ))}
              </select>
            )}
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
