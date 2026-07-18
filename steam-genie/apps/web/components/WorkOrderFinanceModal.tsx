'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import type { WorkOrderExpenseItem, WorkOrderFinance } from '../lib/types';

type Props = {
  workOrderId: string;
  onClose: () => void;
};

function money(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

/** Formatea un número para el input (puntos de miles, coma decimal). */
function formatAmountFromNumber(value: number): string {
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Formatea lo que escribe el usuario: 1220000 → 1.220.000 */
function formatAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, '');
  if (cleaned === '') return '';

  const commaIndex = cleaned.indexOf(',');
  const hasComma = commaIndex !== -1;
  const intDigits = (hasComma ? cleaned.slice(0, commaIndex) : cleaned).replace(/\D/g, '');
  const decDigits = hasComma ? cleaned.slice(commaIndex + 1).replace(/\D/g, '').slice(0, 2) : '';

  const withDots = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (hasComma) return `${withDots},${decDigits}`;
  return withDots;
}

function parseAmountInput(formatted: string): number | null {
  const trimmed = formatted.trim();
  if (trimmed === '') return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function WorkOrderFinanceModal({ workOrderId, onClose }: Props) {
  const [data, setData] = useState<WorkOrderFinance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [clientAmount, setClientAmount] = useState('');
  const [savingAmount, setSavingAmount] = useState(false);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editConcept, setEditConcept] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const finance = await api.get<WorkOrderFinance>(`/work-orders/${workOrderId}/finance`);
      setData(finance);
      setClientAmount(
        finance.clientAmountCharged == null
          ? ''
          : formatAmountFromNumber(finance.clientAmountCharged),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la información');
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveClientAmount(e: FormEvent) {
    e.preventDefault();
    setSavingAmount(true);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/work-orders/${workOrderId}/client-amount`, {
        clientAmountCharged: parseAmountInput(clientAmount),
      });
      setSuccess('Monto cobrado actualizado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el monto');
    } finally {
      setSavingAmount(false);
    }
  }

  async function createExpense(e: FormEvent) {
    e.preventDefault();
    const c = concept.trim();
    if (!c || amount.trim() === '') return;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/work-orders/${workOrderId}/expenses`, {
        concept: c,
        amount: Number(amount),
      });
      setConcept('');
      setAmount('');
      setSuccess('Gasto agregado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el gasto');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(item: WorkOrderExpenseItem) {
    setEditingId(item.id);
    setEditConcept(item.concept);
    setEditAmount(String(item.amount));
  }

  async function saveEdit(id: string) {
    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/work-order-expenses/${id}`, {
        concept: editConcept.trim(),
        amount: Number(editAmount),
      });
      setEditingId(null);
      setSuccess('Gasto actualizado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setSavingId(null);
    }
  }

  async function removeExpense(item: WorkOrderExpenseItem) {
    if (!window.confirm(`¿Eliminar el gasto "${item.concept}"?`)) return;
    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/work-order-expenses/${item.id}`);
      setSuccess('Gasto eliminado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Gastos y cobro del servicio</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {loading ? <p className="muted">Cargando…</p> : null}
        {error ? <div className="alert alert-error">{error}</div> : null}
        {success ? <div className="alert alert-success">{success}</div> : null}

        {data ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              <strong>{data.title}</strong>
              <br />
              {data.building.name}
              {data.building.city ? ` · ${data.building.city}` : ''}
              {data.building.province ? `, ${data.building.province}` : ''}
            </p>

            <form onSubmit={saveClientAmount} className="stock-inline-form" style={{ marginBottom: 16 }}>
              <div className="form-field" style={{ flex: 1, margin: 0 }}>
                <label htmlFor="client-amount">Monto cobrado al cliente</label>
                <input
                  id="client-amount"
                  type="text"
                  inputMode="decimal"
                  value={clientAmount}
                  onChange={(e) => setClientAmount(formatAmountInput(e.target.value))}
                  placeholder="Ej. 1.220.000"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={savingAmount}>
                {savingAmount ? 'Guardando…' : 'Guardar monto'}
              </button>
            </form>

            <h3 style={{ marginBottom: 8 }}>Gastos del servicio</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Total gastos: <strong>{money(data.expensesTotal)}</strong>
            </p>

            <form onSubmit={createExpense} className="stock-inline-form" style={{ marginBottom: 12 }}>
              <div className="form-field" style={{ flex: 2, margin: 0 }}>
                <label htmlFor="expense-concept">Concepto</label>
                <input
                  id="expense-concept"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Ej. Productos de limpieza"
                  required
                />
              </div>
              <div className="form-field" style={{ flex: 1, margin: 0 }}>
                <label htmlFor="expense-amount">Monto</label>
                <input
                  id="expense-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Agregando…' : 'Agregar'}
              </button>
            </form>

            {data.expenses.length === 0 ? (
              <p className="muted">Sin gastos cargados.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      <th>Monto</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {editingId === item.id ? (
                            <input
                              value={editConcept}
                              onChange={(e) => setEditConcept(e.target.value)}
                            />
                          ) : (
                            item.concept
                          )}
                        </td>
                        <td>
                          {editingId === item.id ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                            />
                          ) : (
                            money(item.amount)
                          )}
                        </td>
                        <td>
                          <div className="table-row-actions">
                            {editingId === item.id ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={savingId === item.id}
                                  onClick={() => void saveEdit(item.id)}
                                >
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setEditingId(null)}
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => startEdit(item)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  disabled={savingId === item.id}
                                  onClick={() => void removeExpense(item)}
                                >
                                  Eliminar
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
