import {
  APP_MODULES,
  ROLES,
  type AppModuleKey,
  type RoleName,
} from '@steam-genie/shared-constants';

const USER_MODULES_KEY = 'sg_user_modules';

/** Rutas del panel → módulo requerido (null = siempre accesible si hay sesión web). */
const ROUTE_MODULE_MAP: Array<{ prefix: string; module: AppModuleKey | null }> = [
  { prefix: '/dashboard', module: APP_MODULES.DASHBOARD },
  { prefix: '/configuracion', module: null },
  { prefix: '/buildings', module: APP_MODULES.BUILDINGS },
  { prefix: '/users', module: APP_MODULES.USERS },
  { prefix: '/roles', module: APP_MODULES.ROLES },
  { prefix: '/tasks/motivos', module: APP_MODULES.BUILDINGS },
  { prefix: '/tasks', module: APP_MODULES.TASKS },
  { prefix: '/import', module: APP_MODULES.BUILDINGS },
  { prefix: '/trabajos-eventuales/calendario', module: APP_MODULES.RESERVAS },
  { prefix: '/trabajos-eventuales/reservas', module: APP_MODULES.RESERVAS },
  { prefix: '/trabajos-eventuales/servicios', module: APP_MODULES.SERVICIOS_EVENTUALES },
  { prefix: '/ordenes-checkin', module: APP_MODULES.ORDENES_CHECKIN },
  { prefix: '/peticiones', module: APP_MODULES.PETICION_SERVICIO },
  { prefix: '/reportes', module: APP_MODULES.REPORTES },
  { prefix: '/trabajos-eventuales', module: null },
  { prefix: '/reservations', module: APP_MODULES.RESERVAS },
  { prefix: '/services', module: APP_MODULES.SERVICIOS_EVENTUALES },
  { prefix: '/trabajos-recurrentes', module: APP_MODULES.TRABAJOS_RECURRENTES },
  { prefix: '/presencia', module: APP_MODULES.PRESENCIA },
  { prefix: '/stock/monitoreo', module: APP_MODULES.STOCK_MONITORING },
  { prefix: '/stock/envios', module: APP_MODULES.STOCK_SHIPMENTS },
  { prefix: '/stock/inventario', module: APP_MODULES.STOCK },
  { prefix: '/stock/categorias', module: APP_MODULES.STOCK },
  { prefix: '/stock/proveedores', module: APP_MODULES.STOCK },
  { prefix: '/stock', module: null },
];

export function resolveModuleForPath(pathname: string): AppModuleKey | null {
  const match = ROUTE_MODULE_MAP.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );
  return match?.module ?? null;
}

export function hasModuleAccess(modules: AppModuleKey[], module: AppModuleKey | null): boolean {
  if (!module) return true;
  return modules.includes(module);
}

const ROLE_DENIED_PATHS: Array<{ prefix: string; roles: RoleName[] }> = [
  { prefix: '/reportes', roles: [ROLES.CLIENT, ROLES.PROVIDER] },
];

export function canAccessPath(
  modules: AppModuleKey[],
  pathname: string,
  role?: RoleName | null,
): boolean {
  if (role) {
    for (const entry of ROLE_DENIED_PATHS) {
      if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
        if (entry.roles.includes(role)) return false;
      }
    }
  }

  if (modules.length === 0) return true;
  if (
    pathname === '/trabajos-eventuales/calendario' ||
    pathname.startsWith('/trabajos-eventuales/calendario/')
  ) {
    return (
      hasModuleAccess(modules, APP_MODULES.RESERVAS) ||
      hasModuleAccess(modules, APP_MODULES.SERVICIOS_EVENTUALES)
    );
  }
  const required = resolveModuleForPath(pathname);
  return hasModuleAccess(modules, required);
}

export function saveUserModules(modules: AppModuleKey[]): void {
  localStorage.setItem(USER_MODULES_KEY, JSON.stringify(modules));
}

export function getUserModules(): AppModuleKey[] {
  const raw = localStorage.getItem(USER_MODULES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AppModuleKey[]) : [];
  } catch {
    return [];
  }
}

export function clearUserModules(): void {
  localStorage.removeItem(USER_MODULES_KEY);
}

export function canRoleAccessWeb(role: RoleName): boolean {
  return role !== ROLES.CLEANER;
}

export function canAccessWebWithModules(role: RoleName | null, modules: AppModuleKey[]): boolean {
  if (!role) return false;
  if (role === ROLES.CLEANER) return false;
  if (modules.length > 0) return true;
  return canRoleAccessWeb(role);
}
