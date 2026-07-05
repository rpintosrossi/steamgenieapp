import type { RoleName } from '@steam-genie/shared-constants';
import type { AppModuleKey } from '@steam-genie/shared-constants';

export interface AuthUser {
  id: string;
  dni: string;
  fullName: string;
  /** Denormalized for display/fast auth only. Source of truth is UserBuildingRole. */
  primaryRole: RoleName;
  isActive: boolean;
}

export interface SessionResponse {
  user: AuthUser;
  modules: AppModuleKey[];
}

export interface JwtAccessPayload {
  sub: string; // userId
  dni: string;
  primaryRole: RoleName;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends TokenPair {
  user: AuthUser;
  modules: AppModuleKey[];
}
