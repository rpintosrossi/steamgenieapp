'use client';

interface BuildingOption {
  id: string;
  name: string;
}

interface BuildingTransferListProps {
  available: BuildingOption[];
  assigned: BuildingOption[];
  onAssign: (buildingId: string) => void;
  onUnassign: (buildingId: string) => void;
  onAssignAll?: () => void;
  onUnassignAll?: () => void;
  disabled?: boolean;
}

export function BuildingTransferList({
  available,
  assigned,
  onAssign,
  onUnassign,
  onAssignAll,
  onUnassignAll,
  disabled = false,
}: BuildingTransferListProps) {
  return (
    <div className="building-transfer">
      <div className="building-transfer-panel">
        <div className="building-transfer-panel-header">
          <span className="building-transfer-panel-title">Disponibles</span>
          <span className="muted">{available.length}</span>
        </div>
        {onAssignAll && available.length > 0 ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm building-transfer-panel-action"
            onClick={onAssignAll}
            disabled={disabled}
          >
            Asignar todos
          </button>
        ) : null}
        <ul className="building-transfer-list" role="listbox" aria-label="Edificios disponibles">
          {available.length === 0 ? (
            <li className="building-transfer-empty muted">No hay edificios disponibles</li>
          ) : (
            available.map((building) => (
              <li key={building.id}>
                <button
                  type="button"
                  className="building-transfer-item"
                  onClick={() => onAssign(building.id)}
                  disabled={disabled}
                  title="Asignar edificio"
                >
                  <span>{building.name}</span>
                  <span className="building-transfer-item-action" aria-hidden>
                    →
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="building-transfer-panel">
        <div className="building-transfer-panel-header">
          <span className="building-transfer-panel-title">Asignados</span>
          <span className="muted">{assigned.length}</span>
        </div>
        {onUnassignAll && assigned.length > 0 ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm building-transfer-panel-action"
            onClick={onUnassignAll}
            disabled={disabled}
          >
            Quitar todos
          </button>
        ) : null}
        <ul className="building-transfer-list" role="listbox" aria-label="Edificios asignados">
          {assigned.length === 0 ? (
            <li className="building-transfer-empty muted">Sin edificios asignados</li>
          ) : (
            assigned.map((building) => (
              <li key={building.id}>
                <button
                  type="button"
                  className="building-transfer-item building-transfer-item-assigned"
                  onClick={() => onUnassign(building.id)}
                  disabled={disabled}
                  title="Quitar edificio"
                >
                  <span className="building-transfer-item-action" aria-hidden>
                    ←
                  </span>
                  <span>{building.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
