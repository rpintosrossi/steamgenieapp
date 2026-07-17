'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { segment: 'configuracion', label: 'Configuración' },
  { segment: 'zonas', label: 'Zonas y subzonas' },
  { segment: 'usuarios', label: 'Usuarios' },
] as const;

export function BuildingTabs({ buildingId }: { buildingId: string }) {
  const pathname = usePathname();
  const base = `/buildings/${buildingId}`;

  return (
    <nav className="report-tabs" aria-label="Secciones del edificio">
      {TABS.map((tab) => {
        const href = `${base}/${tab.segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.segment}
            href={href}
            className={`report-tab ${active ? 'active' : ''}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
