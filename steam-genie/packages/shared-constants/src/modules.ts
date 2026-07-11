/** Módulos del panel web administrativo. */
export const APP_MODULES = {
  DASHBOARD: 'dashboard',
  BUILDINGS: 'buildings',
  USERS: 'users',
  TASKS: 'tasks',
  ROLES: 'roles',
  RESERVAS: 'reservas',
  SERVICIOS_EVENTUALES: 'servicios_eventuales',
  ORDENES_CHECKIN: 'ordenes_checkin',
  PETICION_SERVICIO: 'peticion_servicio',
  REPORTES: 'reportes',
  TRABAJOS_RECURRENTES: 'trabajos_recurrentes',
  PRESENCIA: 'presencia',
  STOCK: 'stock',
  STOCK_MONITORING: 'stock_monitoring',
  STOCK_SHIPMENTS: 'stock_shipments',
  GASTOS_SERVICIOS: 'gastos_servicios',
  GASTOS_FIJOS: 'gastos_fijos',
  COMISIONES: 'comisiones',
  RENDICIONES: 'rendiciones',
  MIS_RENDICIONES: 'mis_rendiciones',
} as const;

export type AppModuleKey = (typeof APP_MODULES)[keyof typeof APP_MODULES];

export const ALL_APP_MODULES: AppModuleKey[] = Object.values(APP_MODULES);

/** Permisos por defecto de los roles del sistema (fuente de verdad para seed y fallback). */
export const SYSTEM_ROLE_MODULES: Record<string, AppModuleKey[]> = {
  admin: [...ALL_APP_MODULES],
  manager: [
    APP_MODULES.DASHBOARD,
    APP_MODULES.BUILDINGS,
    APP_MODULES.TASKS,
    APP_MODULES.RESERVAS,
    APP_MODULES.SERVICIOS_EVENTUALES,
    APP_MODULES.REPORTES,
    APP_MODULES.TRABAJOS_RECURRENTES,
    APP_MODULES.PRESENCIA,
    APP_MODULES.STOCK,
    APP_MODULES.STOCK_MONITORING,
    APP_MODULES.STOCK_SHIPMENTS,
    APP_MODULES.GASTOS_SERVICIOS,
    APP_MODULES.GASTOS_FIJOS,
    APP_MODULES.COMISIONES,
    APP_MODULES.RENDICIONES,
  ],
  cleaner: [],
  client: [
    APP_MODULES.DASHBOARD,
    APP_MODULES.TASKS,
    APP_MODULES.TRABAJOS_RECURRENTES,
    APP_MODULES.ORDENES_CHECKIN,
    APP_MODULES.PETICION_SERVICIO,
  ],
  provider: [APP_MODULES.DASHBOARD, APP_MODULES.ORDENES_CHECKIN],
  stock: [APP_MODULES.DASHBOARD, APP_MODULES.STOCK],
};

export const APP_MODULE_LABELS: Record<AppModuleKey, string> = {
  [APP_MODULES.DASHBOARD]: 'Inicio',
  [APP_MODULES.BUILDINGS]: 'Edificios',
  [APP_MODULES.USERS]: 'Usuarios',
  [APP_MODULES.TASKS]: 'Tareas',
  [APP_MODULES.ROLES]: 'Roles y permisos',
  [APP_MODULES.RESERVAS]: 'Reservas',
  [APP_MODULES.SERVICIOS_EVENTUALES]: 'Servicios eventuales',
  [APP_MODULES.ORDENES_CHECKIN]: 'Órdenes check-in / check-out',
  [APP_MODULES.PETICION_SERVICIO]: 'Nueva petición de servicio',
  [APP_MODULES.REPORTES]: 'Reportes',
  [APP_MODULES.TRABAJOS_RECURRENTES]: 'Trabajos recurrentes',
  [APP_MODULES.PRESENCIA]: 'Presencia',
  [APP_MODULES.STOCK]: 'Stock (depósito)',
  [APP_MODULES.STOCK_MONITORING]: 'Monitoreo de stock',
  [APP_MODULES.STOCK_SHIPMENTS]: 'Órdenes de envío',
  [APP_MODULES.GASTOS_SERVICIOS]: 'Gastos de servicios',
  [APP_MODULES.GASTOS_FIJOS]: 'Gastos fijos',
  [APP_MODULES.COMISIONES]: 'Comisiones',
  [APP_MODULES.RENDICIONES]: 'Rendiciones',
  [APP_MODULES.MIS_RENDICIONES]: 'Mis rendiciones',
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
    modules: [
      APP_MODULES.RESERVAS,
      APP_MODULES.SERVICIOS_EVENTUALES,
      APP_MODULES.ORDENES_CHECKIN,
      APP_MODULES.PETICION_SERVICIO,
    ],
  },
  {
    label: 'Cliente',
    modules: [APP_MODULES.PETICION_SERVICIO],
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
  {
    label: 'Gastos y comisiones',
    modules: [
      APP_MODULES.GASTOS_SERVICIOS,
      APP_MODULES.GASTOS_FIJOS,
      APP_MODULES.COMISIONES,
      APP_MODULES.RENDICIONES,
      APP_MODULES.MIS_RENDICIONES,
    ],
  },
];
