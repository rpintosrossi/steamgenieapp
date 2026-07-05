import { SetMetadata } from '@nestjs/common';
import type { AppModuleKey } from '@steam-genie/shared-constants';

export const REQUIRED_MODULES_KEY = 'required_modules';

export const RequiredModules = (...modules: AppModuleKey[]) =>
  SetMetadata(REQUIRED_MODULES_KEY, modules);
