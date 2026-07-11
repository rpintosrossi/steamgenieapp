'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_MODULES, type AppModuleKey } from '@steam-genie/shared-constants';
import { hasModule } from '../lib/auth';

const LINKS: Array<{ href: string; label: string; module: AppModuleKey }> = [
  { href: '/gastos-y-comisiones/gastos-fijos', label: 'Gastos fijos', module: APP_MODULES.GASTOS_FIJOS },
  { href: '/gastos-y-comisiones/comisiones', label: 'Nueva comisión', module: APP_MODULES.COMISIONES },
  { href: '/gastos-y-comisiones/rendiciones', label: 'Rendiciones', module: APP_MODULES.RENDICIONES },
  {
    href: '/gastos-y-comisiones/mis-rendiciones',
    label: 'Mis rendiciones',
    module: APP_MODULES.MIS_RENDICIONES,
  },
];

export function FinanceSubnav() {
  const pathname = usePathname();
  const visible = LINKS.filter((link) => hasModule(link.module));
  if (visible.length === 0) return null;

  return (
    <nav className="subnav" aria-label="Gastos y comisiones">
      {visible.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`subnav-link ${active ? 'active' : ''}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
