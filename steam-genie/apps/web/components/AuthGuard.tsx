'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { SessionResponse } from '@steam-genie/shared-types';
import { api } from '../lib/api-client';
import {
  canAccessWebWithModules,
  clearTokens,
  getCurrentUserRole,
  getUserModules,
  isAuthenticated,
  saveUserModules,
  setLoginError,
  WEB_ACCESS_DENIED_MESSAGE,
} from '../lib/auth';
import { canAccessPath, getDefaultHomePath } from '../lib/modules';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function verify() {
      if (!isAuthenticated()) {
        router.replace('/login');
        return;
      }

      let session: SessionResponse;
      try {
        session = await api.get<SessionResponse>('/auth/me');
        saveUserModules(session.modules);
      } catch {
        clearTokens();
        setLoginError('Tu sesión guardada ya no es válida. Iniciá sesión nuevamente.');
        router.replace('/login');
        return;
      }

      if (!canAccessWebWithModules(session.user.primaryRole, session.modules)) {
        clearTokens();
        setLoginError(WEB_ACCESS_DENIED_MESSAGE);
        router.replace('/login');
        return;
      }

      const modules = getUserModules();
      const role = getCurrentUserRole();
      if (!canAccessPath(modules, pathname, role)) {
        router.replace(getDefaultHomePath(modules));
        return;
      }

      setReady(true);
    }

    void verify();
  }, [router, pathname]);

  if (!ready) {
    return (
      <div className="loading-state" style={{ minHeight: '100vh' }}>
        <div className="spinner" role="status" aria-label="Cargando" />
        <p className="muted">Verificando sesión…</p>
      </div>
    );
  }

  return <>{children}</>;
}
