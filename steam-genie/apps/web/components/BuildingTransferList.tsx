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
  availableTitle?: string;
  assignedTitle?: string;
  assignAllLabel?: string;
  unassignAllLabel?: string;
  availableEmptyLabel?: string;
  assignedEmptyLabel?: string;
  assignTitle?: string;
  unassignTitle?: string;
}

export function BuildingTransferList({
  available,
  assigned,
  onAssign,
  onUnassign,
  onAssignAll,
  onUnassignAll,
  disabled = false,
  availableTitle = 'Disponibles',
  assignedTitle = 'Asignados',
  assignAllLabel = 'Asignar todos',
  unassignAllLabel = 'Quitar todos',
  availableEmptyLabel = 'No hay edificios disponibles',
  assignedEmptyLabel = 'Sin edificios asignados',
  assignTitle = 'Asignar edificio',
  unassignTitle = 'Quitar edificio',
}: BuildingTransferListProps) {
  return (
    <div className="building-transfer">
      <div className="building-transfer-panel">
        <div className="building-transfer-panel-header">
          <span className="building-transfer-panel-title">{availableTitle}</span>
          <span className="muted">{available.length}</span>
        </div>
        {onAssignAll && available.length > 0 ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm building-transfer-panel-action"
            onClick={onAssignAll}
            disabled={disabled}
          >
            {assignAllLabel}
          </button>
        ) : null}
        <ul className="building-transfer-list" role="listbox" aria-label={availableTitle}>
          {available.length === 0 ? (
            <li className="building-transfer-empty muted">{availableEmptyLabel}</li>
          ) : (
            available.map((building) => (
              <li key={building.id}>
                <button
                  type="button"
                  className="building-transfer-item"
                  onClick={() => onAssign(building.id)}
                  disabled={disabled}
                  title={assignTitle}
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
          <span className="building-transfer-panel-title">{assignedTitle}</span>
          <span className="muted">{assigned.length}</span>
        </div>
        {onUnassignAll && assigned.length > 0 ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm building-transfer-panel-action"
            onClick={onUnassignAll}
            disabled={disabled}
          >
            {unassignAllLabel}
          </button>
        ) : null}
        <ul className="building-transfer-list" role="listbox" aria-label={assignedTitle}>
          {assigned.length === 0 ? (
            <li className="building-transfer-empty muted">{assignedEmptyLabel}</li>
          ) : (
            assigned.map((building) => (
              <li key={building.id}>
                <button
                  type="button"
                  className="building-transfer-item building-transfer-item-assigned"
                  onClick={() => onUnassign(building.id)}
                  disabled={disabled}
                  title={unassignTitle}
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
