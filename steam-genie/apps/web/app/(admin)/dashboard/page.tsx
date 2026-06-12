export default function DashboardPage() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Panel de administración</h1>
      </div>

      <div className="card">
        <p style={{ marginTop: 0 }}>
          Bienvenido al panel básico de Steam Genie. Desde acá podés gestionar:
        </p>
        <ul>
          <li><strong>Edificios</strong> — plantas, zonas y subzonas</li>
          <li><strong>Tareas</strong> — maestro de tareas periódicas y eventuales (checkout)</li>
          <li><strong>Usuarios</strong> — altas y roles</li>
          <li><strong>Reservas</strong> — generan servicios de limpieza checkout</li>
          <li><strong>Servicios</strong> — asignar limpiadores a servicios eventuales</li>
        </ul>
      </div>
    </>
  );
}
