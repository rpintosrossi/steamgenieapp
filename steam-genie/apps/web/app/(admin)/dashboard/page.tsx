'use client';

import Link from 'next/link';
import { APP_MODULES, ROLES } from '@steam-genie/shared-constants';
import { getCurrentUserRole, hasModule } from '../../../lib/auth';

const CLIENT_MODULES = [
  {
    href: '/tasks',
    title: 'Tareas',
    description: 'Consulta de tareas configuradas en tus edificios habilitados.',
    module: APP_MODULES.TASKS,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    href: '/trabajos-recurrentes/listado',
    title: 'Trabajos recurrentes',
    description: 'Tareas periódicas con estado, responsable y evidencia fotográfica. Solo lectura.',
    module: APP_MODULES.TRABAJOS_RECURRENTES,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17 1l4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    ),
  },
  {
    href: '/ordenes-checkin',
    title: 'Órdenes check-in / check-out',
    description: 'Servicios aceptados, en curso o completados. Solo lectura.',
    module: APP_MODULES.ORDENES_CHECKIN,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: '/peticiones/nueva',
    title: 'Nueva petición de servicio',
    description: 'Solicitá un servicio en una zona o subzona de tus edificios.',
    module: APP_MODULES.PETICION_SERVICIO,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
];

const PROVIDER_MODULES = [
  {
    href: '/ordenes-checkin',
    title: 'Órdenes check-in / check-out',
    description: 'Servicios aceptados, en curso o completados. Solo lectura.',
    module: APP_MODULES.ORDENES_CHECKIN,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
];

const ADMIN_MODULES = [
  {
    href: '/configuracion',
    title: 'Configuración',
    description: 'Edificios, usuarios y tareas maestras del sistema.',
    module: APP_MODULES.BUILDINGS,
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
    module: APP_MODULES.RESERVAS,
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
    module: APP_MODULES.TRABAJOS_RECURRENTES,
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
  const role = getCurrentUserRole();
  const isProviderOnly = role === ROLES.PROVIDER;
  const isClient = role === ROLES.CLIENT;

  const modules = isProviderOnly
    ? PROVIDER_MODULES.filter((mod) => hasModule(mod.module))
    : isClient
      ? CLIENT_MODULES.filter((mod) => hasModule(mod.module))
      : ADMIN_MODULES.filter((mod) => hasModule(mod.module));

  const title = isProviderOnly
    ? 'Panel de proveedor'
    : isClient
      ? 'Panel de cliente'
      : 'Panel de administración';

  const subtitle = isProviderOnly
    ? 'Consultá el estado de las órdenes check-in / check-out en tus edificios habilitados.'
    : isClient
      ? 'Tareas, trabajos recurrentes, órdenes de trabajo y peticiones de servicio en tus edificios habilitados.'
      : 'Gestioná la configuración, trabajos eventuales y recurrentes desde un solo lugar.';

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="module-grid">
        {modules.map((mod) => (
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
