'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearTokens } from '../lib/auth';

type NavChild = {
  href: string;
  label: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  children?: NavChild[];
};

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Inicio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" />
      </svg>
    ),
  },
  {
    href: '/configuracion',
    label: 'Configuración',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
    children: [
      { href: '/buildings', label: 'Edificios' },
      { href: '/users', label: 'Usuarios' },
      { href: '/tasks', label: 'Tareas' },
    ],
  },
  {
    href: '/trabajos-eventuales',
    label: 'Trabajos eventuales',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01" />
      </svg>
    ),
    children: [
      { href: '/trabajos-eventuales/reservas', label: 'Reservas' },
      { href: '/trabajos-eventuales/servicios', label: 'Servicios' },
    ],
  },
  {
    href: '/trabajos-recurrentes',
    label: 'Trabajos recurrentes',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17 1l4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    ),
    children: [{ href: '/trabajos-recurrentes/listado', label: 'Listado de Trabajos' }],
  },
  {
    href: '/presencia',
    label: 'Presencia',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    children: [{ href: '/presencia/timeline', label: 'Timeline de Presencia' }],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isNavItemActive(pathname: string, item: NavItem) {
  if (isActive(pathname, item.href)) return true;
  if (item.children?.some((child) => isActive(pathname, child.href))) return true;
  return false;
}

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
        <div className="admin-brand">
          <Link href="/dashboard" className="admin-brand-link" aria-label="Ir al inicio">
            <Image
              src="/logoFondoAzul.png"
              alt="Steam Genie"
              width={360}
              height={108}
              className="admin-brand-logo"
              priority
            />
          </Link>
        </div>

        <nav className="admin-nav" aria-label="Navegación principal">
          <span className="admin-nav-section">Menú</span>
          {NAV_ITEMS.map((item) => {
            const itemActive = isNavItemActive(pathname, item);
            return (
              <div key={item.href} className="admin-nav-group">
                <Link
                  href={item.href}
                  className={`admin-nav-link ${itemActive ? 'active' : ''}`}
                >
                  {item.icon}
                  {item.label}
                </Link>
                {item.children ? (
                  <div className="admin-nav-sub">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`admin-nav-link admin-nav-link--sub ${isActive(pathname, child.href) ? 'active' : ''}`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <button
            type="button"
            className="admin-nav-link admin-nav-link--logout"
            onClick={logout}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
