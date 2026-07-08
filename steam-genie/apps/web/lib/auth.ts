import { ROLES, type RoleName } from '@steam-genie/shared-constants';
import type { AppModuleKey } from '@steam-genie/shared-constants';
import type { JwtAccessPayload } from '@steam-genie/shared-types';
import {
  canAccessWebWithModules,
  canRoleAccessWeb,
  clearUserModules,
  getUserModules,
  saveUserModules,
} from './modules';

const ACCESS_TOKEN_KEY = 'sg_access_token';
const REFRESH_TOKEN_KEY = 'sg_refresh_token';
const LOGIN_ERROR_KEY = 'sg_login_error';

export const WEB_ACCESS_DENIED_MESSAGE =
  'Los usuarios limpiadores deben ingresar desde la aplicación móvil.';

export function saveTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function saveSession(
  accessToken: string,
  refreshToken: string,
  modules: AppModuleKey[],
): void {
  saveTokens(accessToken, refreshToken);
  saveUserModules(modules);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  clearUserModules();
}

function decodeAccessTokenPayload(token: string): JwtAccessPayload | null {
  try {
    const [, payloadPart] = token.split('.');
    if (!payloadPart) return null;
    const json = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtAccessPayload;
  } catch {
    return null;
  }
}

export function getCurrentUserRole(): RoleName | null {
  const token = getAccessToken();
  if (!token) return null;
  return decodeAccessTokenPayload(token)?.primaryRole ?? null;
}

export function getCurrentUserId(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  return decodeAccessTokenPayload(token)?.sub ?? null;
}

export {
  getUserModules,
  saveUserModules,
  canRoleAccessWeb,
  canAccessWebWithModules,
} from './modules';

export function canAccessWeb(): boolean {
  const role = getCurrentUserRole();
  return canAccessWebWithModules(role, getUserModules());
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function isAuthenticatedForWeb(): boolean {
  return isAuthenticated() && canAccessWeb();
}

export function setLoginError(message: string): void {
  sessionStorage.setItem(LOGIN_ERROR_KEY, message);
}

export function consumeLoginError(): string | null {
  const message = sessionStorage.getItem(LOGIN_ERROR_KEY);
  if (message) sessionStorage.removeItem(LOGIN_ERROR_KEY);
  return message;
}

export function hasModule(module: AppModuleKey): boolean {
  return getUserModules().includes(module);
}
