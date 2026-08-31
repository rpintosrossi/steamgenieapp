'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api-client';
import { BuildingTransferList } from './BuildingTransferList';
import type { QuoteBranchItem } from '../lib/types';

interface AssignBranchesModalProps {
  userId: string;
  userFullName: string;
  userDni: string;
  branches: QuoteBranchItem[];
  excludedBranchIds: string[];
  onClose: () => void;
  onSaved: () => void;
}

export function AssignBranchesModal({
  userId,
  userFullName,
  userDni,
  branches,
  excludedBranchIds,
  onClose,
  onSaved,
}: AssignBranchesModalProps) {
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalogIds = useMemo(() => new Set(branches.map((branch) => branch.id)), [branches]);

  useEffect(() => {
    setExcludedIds(excludedBranchIds.filter((id) => catalogIds.has(id)));
  }, [catalogIds, excludedBranchIds]);

  const visibleBranches = useMemo(
    () =>
      branches
        .filter((branch) => !excludedIds.includes(branch.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [branches, excludedIds],
  );

  const excludedBranches = useMemo(
    () =>
      excludedIds
        .map((id) => branches.find((branch) => branch.id === id))
        .filter((branch): branch is QuoteBranchItem => Boolean(branch))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [branches, excludedIds],
  );

  function excludeBranch(branchId: string) {
    setExcludedIds((prev) => (prev.includes(branchId) ? prev : [...prev, branchId]));
  }

  function includeBranch(branchId: string) {
    setExcludedIds((prev) => prev.filter((id) => id !== branchId));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.put(`/users/${userId}/excluded-branches`, {
        branchIds: excludedIds,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las exclusiones');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Excluir sucursales</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          {userFullName} · DNI {userDni}
        </p>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form onSubmit={handleSubmit} className="stack">
          <p className="muted" style={{ marginTop: 0 }}>
            Por defecto el usuario ve todas las sucursales. Pasá a la derecha las que no debe ver.
            Aplica a presupuestos, servicios, calendario, trabajos, stock, presencia y el resto de
            la app. También vale para administradores.
          </p>

          <BuildingTransferList
            available={visibleBranches}
            assigned={excludedBranches}
            onAssign={excludeBranch}
            onUnassign={includeBranch}
            onAssignAll={() => setExcludedIds(branches.map((branch) => branch.id))}
            onUnassignAll={() => setExcludedIds([])}
            disabled={saving}
            availableTitle="Visibles"
            assignedTitle="Excluidas"
            assignAllLabel="Excluir todas"
            unassignAllLabel="Quitar todas"
            availableEmptyLabel="Ninguna sucursal visible"
            assignedEmptyLabel="Sin exclusiones: ve todas"
            assignTitle="Excluir sucursal"
            unassignTitle="Volver a mostrar"
          />

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar exclusiones'}
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
