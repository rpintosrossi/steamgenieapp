export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  CLEANER: 'cleaner',
  CLIENT: 'client',
  PROVIDER: 'provider',
  STOCK: 'stock',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
