import { ROLES } from '@steam-genie/shared-constants';

export function isAdminUser(user: { primaryRole?: string | null } | null | undefined): boolean {
  return user?.primaryRole === ROLES.ADMIN;
}
