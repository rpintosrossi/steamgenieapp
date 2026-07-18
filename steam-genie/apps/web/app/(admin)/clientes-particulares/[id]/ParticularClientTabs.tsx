'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { segment: 'datos', label: 'Datos' },
  { segment: 'configuracion', label: 'Ubicación y GPS' },
  { segment: 'zonas', label: 'Zonas y subzonas' },
] as const;

export function ParticularClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/clientes-particulares/${clientId}`;

  return (
    <nav className="report-tabs" aria-label="Secciones del cliente particular">
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
