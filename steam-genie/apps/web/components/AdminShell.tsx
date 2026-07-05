'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { APP_MODULES, type AppModuleKey } from '@steam-genie/shared-constants';
import { clearTokens, getUserModules } from '../lib/auth';

type NavChild = {
  href: string;
  label: string;
  module: AppModuleKey;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  module?: AppModuleKey | null;
  children?: NavChild[];
};

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Inicio',
    module: APP_MODULES.DASHBOARD,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" />
      </svg>
    ),
  },
  {
    href: '/configuracion',
    label: 'Configuración',
    module: null,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
    children: [
      { href: '/buildings', label: 'Edificios', module: APP_MODULES.BUILDINGS },
      { href: '/users', label: 'Usuarios', module: APP_MODULES.USERS },
      { href: '/roles', label: 'Roles', module: APP_MODULES.ROLES },
      { href: '/tasks', label: 'Tareas', module: APP_MODULES.TASKS },
    ],
  },
  {
    href: '/trabajos-eventuales',
    label: 'Trabajos eventuales',
    module: null,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01" />
      </svg>
    ),
    children: [
      { href: '/trabajos-eventuales/reservas', label: 'Reservas', module: APP_MODULES.RESERVAS },
      { href: '/trabajos-eventuales/servicios', label: 'Servicios', module: APP_MODULES.SERVICIOS_EVENTUALES },
    ],
  },
  {
    href: '/trabajos-recurrentes',
    label: 'Trabajos recurrentes',
    module: APP_MODULES.TRABAJOS_RECURRENTES,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17 1l4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    ),
    children: [{ href: '/trabajos-recurrentes/listado', label: 'Listado de Trabajos', module: APP_MODULES.TRABAJOS_RECURRENTES }],
  },
  {
    href: '/presencia',
    label: 'Presencia',
    module: APP_MODULES.PRESENCIA,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    children: [{ href: '/presencia/timeline', label: 'Timeline de Presencia', module: APP_MODULES.PRESENCIA }],
  },
  {
    href: '/stock',
    label: 'Stock',
    module: null,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    children: [
      { href: '/stock/inventario', label: 'Depósito', module: APP_MODULES.STOCK },
      { href: '/stock/categorias', label: 'Categorías', module: APP_MODULES.STOCK },
      { href: '/stock/proveedores', label: 'Proveedores', module: APP_MODULES.STOCK },
      { href: '/stock/monitoreo', label: 'Monitoreo', module: APP_MODULES.STOCK_MONITORING },
      { href: '/stock/envios', label: 'Órdenes de envío', module: APP_MODULES.STOCK_SHIPMENTS },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isNavItemActive(pathname: string, item: NavItem, visibleChildren?: NavChild[]) {
  if (isActive(pathname, item.href)) return true;
  if (visibleChildren?.some((child) => isActive(pathname, child.href))) return true;
  return false;
}

function filterNavItems(modules: AppModuleKey[]): NavItem[] {
  return NAV_ITEMS.reduce<NavItem[]>((acc, item) => {
    const visibleChildren = item.children?.filter((child) => modules.includes(child.module));

    if (item.children) {
      if (!visibleChildren || visibleChildren.length === 0) return acc;
      acc.push({ ...item, children: visibleChildren });
      return acc;
    }

    if (item.module && !modules.includes(item.module)) return acc;
    acc.push(item);
    return acc;
  }, []);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [modules, setModules] = useState<AppModuleKey[]>([]);

  useEffect(() => {
    setModules(getUserModules());
  }, [pathname]);

  const navItems = filterNavItems(modules);

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
          {navItems.map((item) => {
            const itemActive = isNavItemActive(pathname, item, item.children);
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
