'use client';

import Link from 'next/link';
import { APP_MODULES } from '@steam-genie/shared-constants';
import { FinanceSubnav } from '../../../components/FinanceSubnav';
import { hasModule } from '../../../lib/auth';

const CARDS = [
  {
    href: '/gastos-y-comisiones/gastos-fijos',
    title: 'Gastos fijos',
    description: 'ABM de gastos fijos globales o por edificio, con vigencia.',
    module: APP_MODULES.GASTOS_FIJOS,
  },
  {
    href: '/gastos-y-comisiones/comisiones',
    title: 'Nueva comisión',
    description: 'Generá una rendición eligiendo servicios, gastos fijos y porcentaje.',
    module: APP_MODULES.COMISIONES,
  },
  {
    href: '/gastos-y-comisiones/rendiciones',
    title: 'Rendiciones',
    description: 'Listado de todas las rendiciones de la empresa, con detalle y PDF.',
    module: APP_MODULES.RENDICIONES,
  },
  {
    href: '/gastos-y-comisiones/mis-rendiciones',
    title: 'Mis rendiciones',
    description: 'Consultá y descargá tus propias rendiciones.',
    module: APP_MODULES.MIS_RENDICIONES,
  },
];

export default function GastosYComisionesPage() {
  const cards = CARDS.filter((card) => hasModule(card.module));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gastos y comisiones</h1>
          <p className="page-subtitle">
            Administrá gastos de servicios, gastos fijos y rendiciones de comisiones.
          </p>
        </div>
      </div>

      <FinanceSubnav />

      {cards.length === 0 ? (
        <div className="card">
          <p className="muted">No tenés permisos asignados en este módulo.</p>
        </div>
      ) : (
        <div className="module-grid">
          {cards.map((card) => (
            <Link key={card.href} href={card.href} className="module-card">
              <h2 className="module-card-title">{card.title}</h2>
              <p className="muted">{card.description}</p>
            </Link>
          ))}
        </div>
      )}

      {hasModule(APP_MODULES.GASTOS_SERVICIOS) ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ margin: 0 }}>
            Los gastos por servicio y el monto cobrado al cliente se cargan desde{' '}
            <Link href="/trabajos-eventuales/servicios">Trabajos eventuales → Servicios</Link>,
            con el botón <strong>Gastos</strong>.
          </p>
        </div>
      ) : null}
    </>
  );
}
