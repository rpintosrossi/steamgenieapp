'use client';

import Link from 'next/link';

const SUBMODULES = [
  {
    href: '/trabajos-recurrentes/listado',
    title: 'Listado de Trabajos',
    description:
      'Tareas periódicas con estado, responsable, horario de cumplimiento y evidencia fotográfica.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
];

export default function RecurringWorkHubPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Trabajos recurrentes</h1>
          <p className="page-subtitle">
            Seguimiento de tareas periódicas configuradas en el maestro de tareas.
          </p>
        </div>
      </div>

      <div className="module-grid">
        {SUBMODULES.map((mod) => (
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
