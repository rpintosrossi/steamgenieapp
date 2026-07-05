'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/reportes/por-fecha', label: 'Por fecha' },
  { href: '/reportes/por-trabajador', label: 'Por trabajador' },
  { href: '/reportes/por-edificio', label: 'Por edificio' },
] as const;

export function ReportTabs() {
  const pathname = usePathname();

  return (
    <nav className="report-tabs" aria-label="Tipos de reporte">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`report-tab ${active ? 'active' : ''}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
