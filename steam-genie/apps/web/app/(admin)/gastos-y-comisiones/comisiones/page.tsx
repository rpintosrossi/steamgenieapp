'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatStoredCalendarDate } from '@steam-genie/shared-constants';
import { FinanceSubnav } from '../../../../components/FinanceSubnav';
import { WorkOrderFinanceModal } from '../../../../components/WorkOrderFinanceModal';
import { api } from '../../../../lib/api-client';
import { fetchBuildingsList } from '../../../../lib/buildings-cache';
import type {
  CommissionServiceCandidate,
  CommissionSettlementDetail,
  ProratedFixedExpensePreview,
} from '../../../../lib/types';

type UserOption = { id: string; fullName: string; dni: string };

function money(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

export default function NuevaComisionPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [beneficiaryMode, setBeneficiaryMode] = useState<'user' | 'external'>('user');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [beneficiaryUserId, setBeneficiaryUserId] = useState('');
  const [externalName, setExternalName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [cleanerId, setCleanerId] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [amountFilter, setAmountFilter] = useState<'all' | 'with_amount' | 'without_amount'>(
    'all',
  );

  const [services, setServices] = useState<CommissionServiceCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [financeWoId, setFinanceWoId] = useState<string | null>(null);

  const [fixedPreview, setFixedPreview] = useState<ProratedFixedExpensePreview[]>([]);
  const [excludedFixedIds, setExcludedFixedIds] = useState<string[]>([]);
  const [percentage, setPercentage] = useState('20');
  const [creating, setCreating] = useState(false);
  const creatingLock = useRef(false);
  const [created, setCreated] = useState<CommissionSettlementDetail | null>(null);

  useEffect(() => {
    void fetchBuildingsList().then(setBuildings).catch(() => setBuildings([]));

    let cancelled = false;
    async function loadUsers() {
      setLoadingUsers(true);
      try {
        const list = await api.get<UserOption[]>('/commissions/beneficiaries');
        if (!cancelled) setUsers(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) {
          setUsers([]);
          setError(
            e instanceof Error
              ? `No se pudieron cargar los usuarios: ${e.message}`
              : 'No se pudieron cargar los usuarios',
          );
        }
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    }
    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  const cities = useMemo(() => {
    const fromServices = services
      .map((s) => s.building.city)
      .filter((c): c is string => Boolean(c));
    return [...new Set(fromServices)].sort();
  }, [services]);

  const provinces = useMemo(() => {
    const fromServices = services
      .map((s) => s.building.province)
      .filter((p): p is string => Boolean(p));
    return [...new Set(fromServices)].sort();
  }, [services]);

  const loadServices = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoadingServices(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo, amountFilter });
      if (cleanerId) params.set('cleanerId', cleanerId);
      if (city) params.set('city', city);
      if (province) params.set('province', province);
      if (buildingId) params.set('buildingId', buildingId);
      const data = await api.get<CommissionServiceCandidate[]>(
        `/commissions/services?${params}`,
      );
      setServices(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar servicios');
      setServices([]);
    } finally {
      setLoadingServices(false);
    }
  }, [dateFrom, dateTo, amountFilter, cleanerId, city, province, buildingId]);

  async function refreshServiceRow(workOrderId: string) {
    try {
      const finance = await api.get<{
        id: string;
        clientAmountCharged: number | null;
        expenses: Array<{ id: string; concept: string; amount: number }>;
        expensesTotal: number;
      }>(`/work-orders/${workOrderId}/finance`);
      setServices((prev) =>
        prev.map((s) =>
          s.id === workOrderId
            ? {
                ...s,
                clientAmountCharged: finance.clientAmountCharged,
                expenses: finance.expenses.map((e) => ({
                  id: e.id,
                  concept: e.concept,
                  amount: e.amount,
                })),
                expensesTotal: finance.expensesTotal,
              }
            : s,
        ),
      );
    } catch {
      await loadServices();
    }
  }

  async function goToServicesStep() {
    setError(null);
    if (beneficiaryMode === 'user' && !beneficiaryUserId) {
      setError('Elegí un usuario beneficiario.');
      return;
    }
    if (beneficiaryMode === 'external' && !externalName.trim()) {
      setError('Indicá el nombre de la persona.');
      return;
    }
    if (!dateFrom || !dateTo) {
      setError('Indicá el rango de fechas.');
      return;
    }
    setStep(2);
    await loadServices();
  }

  async function goToCalcStep() {
    setError(null);
    if (selectedIds.length === 0) {
      setError('Seleccioná al menos un servicio.');
      return;
    }
    const selected = services.filter((s) => selectedIds.includes(s.id));
    const missing = selected.filter((s) => s.clientAmountCharged == null);
    if (missing.length > 0) {
      setError(
        `Falta el monto cobrado en ${missing.length} servicio(s): ${missing
          .map((m) => m.title)
          .join(', ')}. Completalo en Servicios → Gastos antes de continuar.`,
      );
      return;
    }

    const buildingIds = [...new Set(selected.map((s) => s.building.id))];
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        buildingIds: buildingIds.join(','),
      });
      const preview = await api.get<ProratedFixedExpensePreview[]>(
        `/commissions/fixed-expenses-preview?${params}`,
      );
      setFixedPreview(preview);
      setExcludedFixedIds([]);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron calcular gastos fijos');
    }
  }

  const selectedServices = useMemo(
    () => services.filter((s) => selectedIds.includes(s.id)),
    [services, selectedIds],
  );

  const previewTotals = useMemo(() => {
    const totalClient = selectedServices.reduce(
      (s, i) => s + (i.clientAmountCharged ?? 0),
      0,
    );
    const totalExpenses = selectedServices.reduce((s, i) => s + i.expensesTotal, 0);
    const totalFixed = fixedPreview
      .filter((f) => !excludedFixedIds.includes(f.fixedExpenseId))
      .reduce((s, f) => s + f.proratedAmount, 0);
    const net = totalClient - totalExpenses - totalFixed;
    const pct = Number(percentage) || 0;
    return {
      totalClient,
      totalExpenses,
      totalFixed,
      net,
      commission: Math.round(net * (pct / 100) * 100) / 100,
    };
  }, [selectedServices, fixedPreview, excludedFixedIds, percentage]);

  function toggleService(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const allServicesSelected =
    services.length > 0 && services.every((s) => selectedIds.includes(s.id));

  function toggleAllServices() {
    if (allServicesSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(services.map((s) => s.id));
  }

  function toggleFixed(id: string) {
    setExcludedFixedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleCreate() {
    if (creatingLock.current || creating) return;
    creatingLock.current = true;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const body =
        beneficiaryMode === 'user'
          ? {
              beneficiaryUserId,
              dateFrom,
              dateTo,
              percentage: Number(percentage),
              workOrderIds: selectedIds,
              excludedFixedExpenseIds: excludedFixedIds,
            }
          : {
              externalBeneficiaryName: externalName.trim(),
              dateFrom,
              dateTo,
              percentage: Number(percentage),
              workOrderIds: selectedIds,
              excludedFixedExpenseIds: excludedFixedIds,
            };
      const result = await api.post<CommissionSettlementDetail>('/commissions', body);
      setCreated(result);
      setSuccess('Rendición creada. Se generó el PDF v1.');
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la comisión');
      creatingLock.current = false;
      setCreating(false);
      return;
    }
    // En éxito dejamos el lock activo para no regenerar desde este paso.
    setCreating(false);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Nueva comisión</h1>
          <p className="page-subtitle">
            Paso {step} de 4 — elegí beneficiario, servicios, gastos fijos y porcentaje.
          </p>
        </div>
      </div>

      <FinanceSubnav />

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      {step === 1 ? (
        <div className="card stack" style={{ gap: 12 }}>
          <div className="form-field">
            <label>Beneficiario</label>
            <div className="form-row">
              <label className="checkbox-item">
                <input
                  type="radio"
                  checked={beneficiaryMode === 'user'}
                  onChange={() => setBeneficiaryMode('user')}
                />
                <span>Usuario del sistema</span>
              </label>
              <label className="checkbox-item">
                <input
                  type="radio"
                  checked={beneficiaryMode === 'external'}
                  onChange={() => setBeneficiaryMode('external')}
                />
                <span>Persona externa</span>
              </label>
            </div>
          </div>

          {beneficiaryMode === 'user' ? (
            <div className="form-field">
              <label htmlFor="beneficiary">Usuario</label>
              <select
                id="beneficiary"
                value={beneficiaryUserId}
                onChange={(e) => setBeneficiaryUserId(e.target.value)}
                disabled={loadingUsers}
              >
                <option value="">
                  {loadingUsers
                    ? 'Cargando usuarios…'
                    : users.length === 0
                      ? 'No hay usuarios activos'
                      : 'Seleccionar…'}
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.dni})
                  </option>
                ))}
              </select>
              {!loadingUsers && users.length > 0 ? (
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                  {users.length} usuario{users.length === 1 ? '' : 's'} activo
                  {users.length === 1 ? '' : 's'}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="external-name">Nombre</label>
              <input
                id="external-name"
                value={externalName}
                onChange={(e) => setExternalName(e.target.value)}
                placeholder="Nombre completo"
              />
            </div>
          )}

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="date-from">Desde</label>
              <input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="date-to">Hasta</label>
              <input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <button type="button" className="btn btn-primary" onClick={() => void goToServicesStep()}>
            Continuar
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="card stack" style={{ gap: 12 }}>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="filter-cleaner">Limpiador</label>
              <select
                id="filter-cleaner"
                value={cleanerId}
                onChange={(e) => setCleanerId(e.target.value)}
              >
                <option value="">Todos</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="filter-building">Edificio</label>
              <select
                id="filter-building"
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
              >
                <option value="">Todos</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="filter-city">Ciudad</label>
              <input
                id="filter-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                list="cities-list"
                placeholder="Filtrar ciudad"
              />
              <datalist id="cities-list">
                {cities.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="form-field">
              <label htmlFor="filter-province">Provincia</label>
              <input
                id="filter-province"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                list="provinces-list"
                placeholder="Filtrar provincia"
              />
              <datalist id="provinces-list">
                {provinces.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div className="form-field">
              <label htmlFor="filter-amount">Monto cobrado</label>
              <select
                id="filter-amount"
                value={amountFilter}
                onChange={(e) =>
                  setAmountFilter(e.target.value as 'all' | 'with_amount' | 'without_amount')
                }
              >
                <option value="all">Todos</option>
                <option value="with_amount">Con monto</option>
                <option value="without_amount">Sin monto</option>
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void loadServices()}>
              Aplicar filtros
            </button>
            {services.length > 0 ? (
              <button type="button" className="btn btn-secondary" onClick={toggleAllServices}>
                {allServicesSelected
                  ? 'Deseleccionar todas'
                  : `Seleccionar todas (${services.length})`}
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
              Volver
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void goToCalcStep()}>
              Calcular
              {selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
            </button>
          </div>

          {loadingServices ? (
            <p className="muted">Cargando servicios…</p>
          ) : services.length === 0 ? (
            <p className="muted">No hay servicios en ese rango / filtros.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allServicesSelected}
                        onChange={toggleAllServices}
                        title={
                          allServicesSelected
                            ? 'Deseleccionar todas'
                            : 'Seleccionar todas'
                        }
                        aria-label="Seleccionar todas las tareas"
                      />
                    </th>
                    <th>Fecha</th>
                    <th>Servicio</th>
                    <th>Edificio</th>
                    <th>Ciudad / Prov.</th>
                    <th>Limpiadores</th>
                    <th>Cobrado</th>
                    <th>Gastos</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(s.id)}
                          onChange={() => toggleService(s.id)}
                        />
                      </td>
                      <td>{formatStoredCalendarDate(s.scheduledDate)}</td>
                      <td>{s.title}</td>
                      <td>{s.building.name}</td>
                      <td>
                        {[s.building.city, s.building.province].filter(Boolean).join(', ') ||
                          '—'}
                      </td>
                      <td>
                        {s.cleaners.map((c) => c.fullName).join(', ') || '—'}
                      </td>
                      <td>
                        <span
                          style={{
                            color: s.clientAmountCharged == null ? 'var(--color-danger, #b91c1c)' : undefined,
                            fontWeight: s.clientAmountCharged == null ? 600 : undefined,
                          }}
                        >
                          {money(s.clientAmountCharged)}
                        </span>
                      </td>
                      <td>
                        {money(s.expensesTotal)}
                        {s.expenses.length > 0 ? (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {s.expenses.map((e) => e.concept).join(' · ')}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setFinanceWoId(s.id)}
                          title="Editar cobrado y gastos"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="card stack" style={{ gap: 16 }}>
          <div>
            <h2 className="card-title">Servicios seleccionados ({selectedServices.length})</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Cobrado</th>
                    <th>Gastos</th>
                    <th>Detalle gastos</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedServices.map((s) => (
                    <tr key={s.id}>
                      <td>
                        {formatStoredCalendarDate(s.scheduledDate)} · {s.title}
                        <div className="muted" style={{ fontSize: 12 }}>
                          {s.cleaners.map((c) => c.fullName).join(', ') || 'Sin limpiador'}
                        </div>
                      </td>
                      <td>{money(s.clientAmountCharged)}</td>
                      <td>{money(s.expensesTotal)}</td>
                      <td>
                        {s.expenses.length === 0
                          ? '—'
                          : s.expenses.map((e) => `${e.concept}: ${money(e.amount)}`).join(' · ')}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setFinanceWoId(s.id)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="card-title">Gastos fijos (prorrateados)</h2>
            <p className="muted">
              Incluidos por defecto. Desmarcá los que no correspondan a este beneficiario.
            </p>
            {fixedPreview.length === 0 ? (
              <p className="muted">No hay gastos fijos vigentes en el período.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Incluir</th>
                      <th>Concepto</th>
                      <th>Alcance</th>
                      <th>Monto</th>
                      <th>Prorrateado</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixedPreview.map((f) => (
                      <tr key={f.fixedExpenseId}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!excludedFixedIds.includes(f.fixedExpenseId)}
                            onChange={() => toggleFixed(f.fixedExpenseId)}
                          />
                        </td>
                        <td>{f.concept}</td>
                        <td>{f.isGlobal ? 'Global' : f.buildingName}</td>
                        <td>{money(f.fullAmount)}</td>
                        <td>{money(f.proratedAmount)}</td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {f.prorationNote}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="form-field" style={{ maxWidth: 200 }}>
            <label htmlFor="pct">Porcentaje de comisión (%)</label>
            <input
              id="pct"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
            />
          </div>

          <div className="alert alert-info">
            <div>Σ Cobrado: {money(previewTotals.totalClient)}</div>
            <div>(−) Gastos servicios: {money(previewTotals.totalExpenses)}</div>
            <div>(−) Gastos fijos: {money(previewTotals.totalFixed)}</div>
            <div>
              <strong>Neto: {money(previewTotals.net)}</strong>
            </div>
            <div>
              <strong>
                Comisión ({percentage}%): {money(previewTotals.commission)}
              </strong>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>
              Volver
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={creating}
              onClick={() => void handleCreate()}
            >
              {creating ? 'Generando…' : 'Generar rendición y PDF'}
            </button>
          </div>
        </div>
      ) : null}

      {step === 4 && created ? (
        <div className="card stack" style={{ gap: 12 }}>
          <h2 className="card-title">Rendición generada</h2>
          <p>
            Beneficiario: <strong>{created.beneficiaryName}</strong>
          </p>
          <p>
            Comisión: <strong>{money(created.commissionAmount)}</strong> (v
            {created.currentPdfVersion})
          </p>
          <ul>
            {(created.calculationBreakdown.lines ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                void api.download(
                  `/commissions/${created.id}/pdf`,
                  `rendicion-${created.id.slice(0, 8)}.pdf`,
                )
              }
            >
              Descargar PDF
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.push(`/gastos-y-comisiones/rendiciones/${created.id}`)}
            >
              Ver detalle
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.push('/gastos-y-comisiones/rendiciones')}
            >
              Ir al listado
            </button>
          </div>
        </div>
      ) : null}

      {financeWoId ? (
        <WorkOrderFinanceModal
          workOrderId={financeWoId}
          onClose={() => {
            const id = financeWoId;
            setFinanceWoId(null);
            void refreshServiceRow(id);
          }}
        />
      ) : null}
    </>
  );
}
