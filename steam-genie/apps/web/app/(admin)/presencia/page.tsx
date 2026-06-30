'use client';

import Link from 'next/link';

const SUBMODULES = [
  {
    href: '/presencia/timeline',
    title: 'Timeline de Presencia',
    description:
      'Fichajes del día por trabajador y edificio, con horarios de entrada y salida.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
];

export default function PresenciaHubPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Presencia</h1>
          <p className="page-subtitle">Control y seguimiento de fichajes del personal.</p>
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
