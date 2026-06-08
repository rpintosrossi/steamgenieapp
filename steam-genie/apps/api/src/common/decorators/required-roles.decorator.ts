import { SetMetadata } from '@nestjs/common';
import type { RoleName } from '@steam-genie/shared-constants';

export const REQUIRED_ROLES_KEY = 'requiredRoles';

/**
 * Declare which roles are allowed to access a route.
 * Authorization is checked against UserBuildingRole (source of truth),
 * NOT against User.primaryRole.
 */
export const RequiredRoles = (...roles: RoleName[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);
