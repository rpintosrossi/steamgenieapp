'use client';

import Link from 'next/link';

const SUBMODULES = [
  {
    href: '/buildings',
    title: 'Edificios',
    description: 'Gestioná edificios, plantas, zonas, subzonas e importación Excel.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
      </svg>
    ),
  },
  {
    href: '/users',
    title: 'Usuarios',
    description: 'Altas, edición y asignación de roles por edificio.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/tasks',
    title: 'Tareas',
    description: 'Maestro de tareas periódicas, eventuales y motivos de no realización.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

export default function ConfiguracionPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">
            Estructura del sistema: edificios, usuarios y tareas maestras.
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
