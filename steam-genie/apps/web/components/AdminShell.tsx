'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearTokens } from '../lib/auth';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Inicio' },
  { href: '/buildings', label: 'Edificios' },
  { href: '/tasks', label: 'Tareas' },
  { href: '/users', label: 'Usuarios' },
  { href: '/reservations', label: 'Reservas' },
  { href: '/services', label: 'Servicios' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearTokens();
    router.replace('/login');
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">Steam Genie Admin</div>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`admin-nav-link ${pathname === item.href || pathname.startsWith(`${item.href}/`) ? 'active' : ''}`}
          >
            {item.label}
          </Link>
        ))}
        <button type="button" className="admin-nav-link" onClick={logout} style={{ marginTop: 'auto', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
          Cerrar sesión
        </button>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
