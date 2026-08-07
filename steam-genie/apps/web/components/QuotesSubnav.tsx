'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/presupuestos', label: 'Listado', exact: true },
  { href: '/presupuestos/metodos-pago', label: 'Métodos de pago', exact: false },
];

export function QuotesSubnav() {
  const pathname = usePathname();

  return (
    <nav className="subnav" aria-label="Presupuestos">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href || pathname === `${link.href}/`
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`subnav-link${active ? ' active' : ''}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
