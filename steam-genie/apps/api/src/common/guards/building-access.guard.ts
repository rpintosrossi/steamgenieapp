import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { BUILDING_SCOPED_KEY } from '../decorators/building-scoped.decorator';
import type { AuthUser } from '@steam-genie/shared-types';

/**
 * Verifies the user has at least one role (global or building-scoped)
 * for the building referenced in the request.
 *
 * Use together with @BuildingScoped() on routes that operate on a specific building.
 * For role-specific checks, combine with RolesGuard + @RequiredRoles().
 */
@Injectable()
export class BuildingAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isBuildingScoped = this.reflector.getAllAndOverride<boolean>(
      BUILDING_SCOPED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isBuildingScoped) return true;

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
      (request.body['buildingId'] as string | undefined);

    if (!buildingId) return true; // No building context — skip check

    const access = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: user.id,
        OR: [
          { buildingId: null }, // Global access
          { buildingId },
        ],
      },
    });

    if (!access) {
      throw new ForbiddenException(
        'You do not have access to this building.',
      );
    }

    return true;
  }
}
