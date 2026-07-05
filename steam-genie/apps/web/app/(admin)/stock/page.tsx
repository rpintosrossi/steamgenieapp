'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { APP_MODULES, type AppModuleKey } from '@steam-genie/shared-constants';
import { StockSubnav } from '../../../components/StockSubnav';
import { getUserModules } from '../../../lib/auth';

const SUBMODULES: Array<{
  href: string;
  title: string;
  description: string;
  module: AppModuleKey;
  icon: React.ReactNode;
}> = [
  {
    href: '/stock/inventario',
    title: 'Depósito',
    module: APP_MODULES.STOCK,
    description:
      'Inventario central, estadísticas, ajustes rápidos y reservas por órdenes de envío.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    href: '/stock/categorias',
    title: 'Categorías',
    module: APP_MODULES.STOCK,
    description: 'Agrupá los productos del inventario por categoría.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: '/stock/proveedores',
    title: 'Proveedores',
    module: APP_MODULES.STOCK,
    description: 'Gestioná los proveedores de insumos del inventario.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 21h18M3 7v1l9-4 9 4V7M3 7l9 4 9-4M12 11v10" />
      </svg>
    ),
  },
  {
    href: '/stock/monitoreo',
    title: 'Monitoreo de stock',
    module: APP_MODULES.STOCK_MONITORING,
    description:
      'Stock por edificio, alertas reportadas por limpiadores y ajuste manual de cantidades.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 3v18h18" />
        <path d="M7 16l4-8 4 5 5-9" />
      </svg>
    ),
  },
  {
    href: '/stock/envios',
    title: 'Órdenes de envío',
    module: APP_MODULES.STOCK_SHIPMENTS,
    description:
      'Armá envíos multi-edificio, despachá con fecha de entrega y confirmá recepciones.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="1" y="3" width="15" height="13" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
];

export default function StockHubPage() {
  const [modules, setModules] = useState<AppModuleKey[]>([]);

  useEffect(() => {
    setModules(getUserModules());
  }, []);

  const visible = SUBMODULES.filter((mod) => modules.includes(mod.module));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock</h1>
          <p className="page-subtitle">
            Depósito, monitoreo por edificio y logística de envíos.
          </p>
        </div>
      </div>

      <StockSubnav />

      {visible.length === 0 ? (
        <p className="text-muted">No tenés permisos para acceder a las secciones de stock.</p>
      ) : (
        <div className="module-grid">
          {visible.map((mod) => (
            <Link key={mod.href} href={mod.href} className="module-card">
              <div className="module-card-icon">{mod.icon}</div>
              <h2 className="module-card-title">{mod.title}</h2>
              <p className="module-card-desc">{mod.description}</p>
              <span className="module-card-arrow">Ir al módulo →</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
