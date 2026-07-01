'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/tasks', label: 'Maestro de tareas' },
  { href: '/tasks/motivos', label: 'Motivos de no realización' },
];

export function TasksSubnav() {
  const pathname = usePathname();

  return (
    <nav className="subnav" aria-label="Sección tareas">
      {LINKS.map((link) => {
        const active =
          pathname === link.href ||
          (link.href !== '/tasks' && pathname.startsWith(link.href));
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
