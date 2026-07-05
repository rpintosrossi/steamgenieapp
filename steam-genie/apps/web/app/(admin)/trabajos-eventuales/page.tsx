'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CreateEventualWorkModal } from '../../../components/CreateEventualWorkModal';
import type { CreateCheckoutCleaningResponse } from '../../../lib/types';

const SUBMODULES = [
  {
    href: '/trabajos-eventuales/reservas',
    title: 'Reservas',
    description:
      'Registrá reservas de huéspedes. Cada reserva genera automáticamente un servicio checkout.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: '/trabajos-eventuales/servicios',
    title: 'Servicios',
    description:
      'Listado de servicios checkout. Asigná limpiadores y seguí el estado de cada trabajo.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    href: '/trabajos-eventuales/calendario',
    title: 'Calendario',
    description:
      'Vista mensual de reservas (duración de estadía), servicios de limpieza y trabajadores asignados.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01" />
      </svg>
    ),
  },
];

export default function EventualWorkHubPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function handleCreated(result: CreateCheckoutCleaningResponse) {
    setCreateOpen(false);
    setSuccess(
      `Trabajo eventual creado: "${result.workOrder.title}" (${result.taskCount} tareas). Podés asignarlo en Servicios.`,
    );
    if (result.warning) setInfo(result.warning);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Trabajos eventuales</h1>
          <p className="page-subtitle">
            Gestioná reservas y servicios de limpieza checkout. También podés crear un servicio
            manualmente, sin reserva asociada.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setCreateOpen(true);
              setSuccess(null);
              setInfo(null);
            }}
          >
            Crear trabajo eventual
          </button>
        </div>
      </div>

      {success ? <div className="alert alert-success">{success}</div> : null}
      {info ? <div className="alert alert-info">{info}</div> : null}

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

      {createOpen ? (
        <CreateEventualWorkModal
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : null}
    </>
  );
}
