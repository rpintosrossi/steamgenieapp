/** Módulos del panel web administrativo. */
export const APP_MODULES = {
  DASHBOARD: 'dashboard',
  BUILDINGS: 'buildings',
  USERS: 'users',
  TASKS: 'tasks',
  ROLES: 'roles',
  RESERVAS: 'reservas',
  SERVICIOS_EVENTUALES: 'servicios_eventuales',
  TRABAJOS_RECURRENTES: 'trabajos_recurrentes',
  PRESENCIA: 'presencia',
  STOCK: 'stock',
  STOCK_MONITORING: 'stock_monitoring',
  STOCK_SHIPMENTS: 'stock_shipments',
} as const;

export type AppModuleKey = (typeof APP_MODULES)[keyof typeof APP_MODULES];

export const ALL_APP_MODULES: AppModuleKey[] = Object.values(APP_MODULES);

export const APP_MODULE_LABELS: Record<AppModuleKey, string> = {
  [APP_MODULES.DASHBOARD]: 'Inicio',
  [APP_MODULES.BUILDINGS]: 'Edificios',
  [APP_MODULES.USERS]: 'Usuarios',
  [APP_MODULES.TASKS]: 'Tareas',
  [APP_MODULES.ROLES]: 'Roles y permisos',
  [APP_MODULES.RESERVAS]: 'Reservas',
  [APP_MODULES.SERVICIOS_EVENTUALES]: 'Servicios eventuales',
  [APP_MODULES.TRABAJOS_RECURRENTES]: 'Trabajos recurrentes',
  [APP_MODULES.PRESENCIA]: 'Presencia',
  [APP_MODULES.STOCK]: 'Stock (depósito)',
  [APP_MODULES.STOCK_MONITORING]: 'Monitoreo de stock',
  [APP_MODULES.STOCK_SHIPMENTS]: 'Órdenes de envío',
};

export const APP_MODULE_GROUPS: Array<{
  label: string;
  modules: AppModuleKey[];
}> = [
  {
    label: 'General',
    modules: [APP_MODULES.DASHBOARD],
  },
  {
    label: 'Configuración',
    modules: [
      APP_MODULES.BUILDINGS,
      APP_MODULES.USERS,
      APP_MODULES.TASKS,
      APP_MODULES.ROLES,
    ],
  },
  {
    label: 'Trabajos eventuales',
    modules: [APP_MODULES.RESERVAS, APP_MODULES.SERVICIOS_EVENTUALES],
  },
  {
    label: 'Operaciones',
    modules: [
      APP_MODULES.TRABAJOS_RECURRENTES,
      APP_MODULES.PRESENCIA,
      APP_MODULES.STOCK,
      APP_MODULES.STOCK_MONITORING,
      APP_MODULES.STOCK_SHIPMENTS,
    ],
  },
];
