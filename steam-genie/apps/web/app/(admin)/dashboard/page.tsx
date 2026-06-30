import Link from 'next/link';

const MODULES = [
  {
    href: '/configuracion',
    title: 'Configuración',
    description: 'Edificios, usuarios y tareas maestras del sistema.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
  {
    href: '/trabajos-eventuales',
    title: 'Trabajos eventuales',
    description: 'Reservas, servicios checkout y creación manual de trabajos eventuales.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01" />
      </svg>
    ),
  },
  {
    href: '/trabajos-recurrentes',
    title: 'Trabajos recurrentes',
    description: 'Seguimiento de tareas periódicas con estado, responsable y fotos.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17 1l4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    ),
  },
];

export default function DashboardPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Panel de administración</h1>
          <p className="page-subtitle">Gestioná la configuración, trabajos eventuales y recurrentes desde un solo lugar.</p>
        </div>
      </div>

      <div className="module-grid">
        {MODULES.map((mod) => (
          <Link key={mod.href} href={mod.href} className="module-card">
            <div className="module-card-icon">{mod.icon}</div>
            <h2 className="module-card-title">{mod.title}</h2>
            <p className="module-card-desc">{mod.description}</p>
            <span className="module-card-arrow">Ir al módulo →</span>
          </Link>
        ))}
      </div>
    </>
  );
}
