import { ROLES, type RoleName } from '@steam-genie/shared-constants';
import type { JwtAccessPayload } from '@steam-genie/shared-types';

const ACCESS_TOKEN_KEY = 'sg_access_token';
const REFRESH_TOKEN_KEY = 'sg_refresh_token';
const LOGIN_ERROR_KEY = 'sg_login_error';

export const WEB_ACCESS_DENIED_MESSAGE =
  'Los usuarios limpiadores deben ingresar desde la aplicación móvil.';

export function saveTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
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

export function canRoleAccessWeb(role: RoleName): boolean {
  return role !== ROLES.CLEANER;
}

export function canAccessWeb(): boolean {
  const role = getCurrentUserRole();
  if (!role) return false;
  return canRoleAccessWeb(role);
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
