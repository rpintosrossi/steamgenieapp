import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppModuleKey } from '@steam-genie/shared-constants';
import type { AuthUser } from '@steam-genie/shared-types';
import { RolesService } from '../../modules/users/roles.service';
import { REQUIRED_MODULES_KEY } from '../decorators/required-modules.decorator';

@Injectable()
export class ModulesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesService: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModules = this.reflector.getAllAndOverride<AppModuleKey[]>(
      REQUIRED_MODULES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredModules?.length) return true;

    const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const modules = await this.rolesService.getUserModules(user.id);
    const allowed = requiredModules.some((module) => modules.includes(module));
    if (!allowed) {
      throw new ForbiddenException('No tenés permiso para este módulo.');
    }

    return true;
  }
}
