'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { APP_MODULES, type AppModuleKey } from '@steam-genie/shared-constants';
import { getUserModules } from '../lib/auth';

const ALL_LINKS: Array<{ href: string; label: string; module: AppModuleKey }> = [
  { href: '/stock/inventario', label: 'Depósito', module: APP_MODULES.STOCK },
  { href: '/stock/categorias', label: 'Categorías', module: APP_MODULES.STOCK },
  { href: '/stock/proveedores', label: 'Proveedores', module: APP_MODULES.STOCK },
  { href: '/stock/monitoreo', label: 'Monitoreo', module: APP_MODULES.STOCK_MONITORING },
  { href: '/stock/envios', label: 'Órdenes de envío', module: APP_MODULES.STOCK_SHIPMENTS },
];

function isLinkActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StockSubnav() {
  const pathname = usePathname();
  const [modules, setModules] = useState<AppModuleKey[]>([]);

  useEffect(() => {
    setModules(getUserModules());
  }, [pathname]);

  const links = ALL_LINKS.filter((link) => modules.includes(link.module));

  if (links.length === 0) return null;

  return (
    <nav className="subnav" aria-label="Sección stock">
      {links.map((link) => {
        const active = isLinkActive(pathname, link.href);
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
