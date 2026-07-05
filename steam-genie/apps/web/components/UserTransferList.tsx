'use client';

interface UserOption {
  id: string;
  fullName: string;
  dni: string;
}

interface UserTransferListProps {
  available: UserOption[];
  assigned: UserOption[];
  onAssign: (userId: string) => void;
  onUnassign: (userId: string) => void;
  onAssignAll?: () => void;
  onUnassignAll?: () => void;
  disabled?: boolean;
}

function formatUserLabel(user: UserOption): string {
  return `${user.fullName} · DNI ${user.dni}`;
}

export function UserTransferList({
  available,
  assigned,
  onAssign,
  onUnassign,
  onAssignAll,
  onUnassignAll,
  disabled = false,
}: UserTransferListProps) {
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
        <ul className="building-transfer-list" role="listbox" aria-label="Usuarios disponibles">
          {available.length === 0 ? (
            <li className="building-transfer-empty muted">No hay usuarios disponibles</li>
          ) : (
            available.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  className="building-transfer-item"
                  onClick={() => onAssign(user.id)}
                  disabled={disabled}
                  title="Asignar usuario"
                >
                  <span>{formatUserLabel(user)}</span>
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
          <span className="building-transfer-panel-title">Con acceso</span>
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
        <ul className="building-transfer-list" role="listbox" aria-label="Usuarios con acceso">
          {assigned.length === 0 ? (
            <li className="building-transfer-empty muted">Sin usuarios asignados</li>
          ) : (
            assigned.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  className="building-transfer-item building-transfer-item-assigned"
                  onClick={() => onUnassign(user.id)}
                  disabled={disabled}
                  title="Quitar acceso"
                >
                  <span className="building-transfer-item-action" aria-hidden>
                    ←
                  </span>
                  <span>{formatUserLabel(user)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

export function getUserIdsForRole(
  assignments: Array<{ role: { id: string }; userId: string }>,
  roleId: string,
): string[] {
  return assignments
    .filter((item) => item.role.id === roleId)
    .map((item) => item.userId);
}
