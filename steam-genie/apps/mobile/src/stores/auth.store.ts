import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AuthUser, TokenPair } from '@steam-genie/shared-types';

const ACCESS_TOKEN_KEY = 'sg_access_token';
const REFRESH_TOKEN_KEY = 'sg_refresh_token';
const USER_KEY = 'sg_user';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';

let refreshInFlight: Promise<string | null> | null = null;

function isAccessTokenExpired(token: string, skewMs = 60_000): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { exp?: number };
    if (!payload.exp) return true;
    return payload.exp * 1000 < Date.now() + skewMs;
  } catch {
    return true;
  }
}

async function persistTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isHydrated: boolean;
  login: (dni: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  refreshTokens: () => Promise<string | null>;
  ensureAccessToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isHydrated: false,

  hydrate: async () => {
    const [accessToken, refreshToken, userJson] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);
    let user: AuthUser | null = null;
    if (userJson) {
      try {
        user = JSON.parse(userJson) as AuthUser;
      } catch {
        user = null;
      }
    }
    set({ accessToken, refreshToken, user, isHydrated: true });

    if (refreshToken && (!accessToken || isAccessTokenExpired(accessToken))) {
      await get().refreshTokens();
    }
  },

  refreshTokens: async () => {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      const { refreshToken } = get();
      if (!refreshToken) return null;

      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) {
          await get().logout();
          return null;
        }

        const data = (await res.json()) as TokenPair;
        await persistTokens(data.accessToken, data.refreshToken);
        set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return data.accessToken;
      } catch {
        await get().logout();
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  },

  ensureAccessToken: async () => {
    const { accessToken, refreshToken } = get();
    if (accessToken && !isAccessTokenExpired(accessToken)) {
      return accessToken;
    }
    if (refreshToken) {
      return get().refreshTokens();
    }
    return null;
  },

  login: async (dni: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? 'Invalid credentials');
    }

    const data: TokenPair & { user: AuthUser } = await res.json();

    await Promise.all([
      persistTokens(data.accessToken, data.refreshToken),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user)),
    ]);

    set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
  },

  logout: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
    set({ accessToken: null, refreshToken: null, user: null });
  },
}));
