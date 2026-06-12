import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { REQUIRED_ROLES_KEY } from '../decorators/required-roles.decorator';
import type { RoleName } from '@steam-genie/shared-constants';
import type { AuthUser } from '@steam-genie/shared-types';

/**
 * Authorization guard.
 *
 * Source of truth: user_building_roles table.
 * User.primaryRole is NOT used for authorization decisions.
 *
 * Logic:
 * 1. If no @RequiredRoles decorator → allow (route is role-agnostic).
 * 2. Check user_building_roles for a matching role:
 *    - Global roles (building_id = null) apply everywhere.
 *    - Building-scoped roles apply only when buildingId matches.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<{
      user: AuthUser;
      params: Record<string, string>;
      query: Record<string, string>;
      body: Record<string, unknown>;
    }>();

    const user = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const buildingId =
      request.params['buildingId'] ??
      request.query['buildingId'] ??
      (request.body['buildingId'] as string | undefined) ??
      null;

    const match = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: user.id,
        role: { name: { in: requiredRoles } },
        OR: [
          { buildingId: null },
          ...(buildingId ? [{ buildingId }] : []),
        ],
      },
    });

    if (match) return true;

    // Sin edificio en la request: alcanza con tener el rol en cualquier edificio (p. ej. app móvil).
    if (!buildingId) {
      const anyAssignment = await this.prisma.userBuildingRole.findFirst({
        where: {
          userId: user.id,
          role: { name: { in: requiredRoles } },
        },
      });
      if (anyAssignment) return true;
    }

    // Compat: primaryRole denormalizado
    if (requiredRoles.includes(user.primaryRole as RoleName)) {
      return true;
    }

    throw new ForbiddenException(
      'No tenés el rol necesario para esta acción.',
    );
  }
}
