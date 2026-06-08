import { SetMetadata } from '@nestjs/common';

export const BUILDING_SCOPED_KEY = 'buildingScoped';

/**
 * Marks a route as building-scoped.
 * BuildingAccessGuard will verify the authenticated user has a role
 * in the target building (via user_building_roles).
 *
 * The building ID must be provided as a route param named `buildingId`,
 * a query param named `buildingId`, or in the request body as `buildingId`.
 */
export const BuildingScoped = () => SetMetadata(BUILDING_SCOPED_KEY, true);
