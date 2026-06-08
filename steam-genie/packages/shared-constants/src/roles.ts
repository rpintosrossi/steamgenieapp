export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  CLEANER: 'cleaner',
  CLIENT: 'client',
  PROVIDER: 'provider',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
