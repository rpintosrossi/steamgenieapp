import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AuthUser, TokenPair } from '@steam-genie/shared-types';

const ACCESS_TOKEN_KEY = 'sg_access_token';
const REFRESH_TOKEN_KEY = 'sg_refresh_token';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isHydrated: boolean;
  login: (dni: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isHydrated: false,

  hydrate: async () => {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]);
    set({ accessToken, refreshToken, isHydrated: true });
  },

  login: async (dni: string, password: string) => {
    const res = await fetch(
      `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'}/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni, password }),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? 'Invalid credentials');
    }

    const data: TokenPair & { user: AuthUser } = await res.json();

    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken),
    ]);

    set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
  },

  logout: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
    set({ accessToken: null, refreshToken: null, user: null });
  },
}));
