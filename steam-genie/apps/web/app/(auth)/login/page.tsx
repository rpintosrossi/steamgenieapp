'use client';

import Image from 'next/image';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginSchema } from '@steam-genie/shared-validators';
import type { LoginResponse, SessionResponse } from '@steam-genie/shared-types';
import { api } from '../../../lib/api-client';
import {
  WEB_ACCESS_DENIED_MESSAGE,
  canAccessWebWithModules,
  clearTokens,
  consumeLoginError,
  isAuthenticatedForWeb,
  saveSession,
  saveUserModules,
} from '../../../lib/auth';
import { getDefaultHomePath } from '../../../lib/modules';
import { ApkDownloadButton } from '../../../components/ApkDownloadButton';

export default function LoginPage() {
  const router = useRouter();
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const loginError = consumeLoginError();
      if (loginError) {
        if (!cancelled) setError(loginError);
        return;
      }

      if (!isAuthenticatedForWeb()) {
        clearTokens();
        return;
      }

      try {
        const session = await api.get<SessionResponse>('/auth/me');
        if (!canAccessWebWithModules(session.user.primaryRole, session.modules)) {
          clearTokens();
          return;
        }
        saveUserModules(session.modules);
        router.replace(getDefaultHomePath(session.modules));
      } catch {
        clearTokens();
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ dni, password });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Datos inválidos');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/auth/login', parsed.data, { skipAuth: true });
      if (!canAccessWebWithModules(res.user.primaryRole, res.modules)) {
        setError(WEB_ACCESS_DENIED_MESSAGE);
        return;
      }
      saveSession(res.accessToken, res.refreshToken, res.modules);
      router.replace(getDefaultHomePath(res.modules));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand-panel">
        <div className="login-brand-content">
          <Image
            src="/logo-fondoazul.jpeg"
            alt="Steam Genie"
            width={480}
            height={480}
            className="login-brand-logo"
            priority
          />
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="card">
            <h1>Iniciar sesión</h1>
            <p className="muted">Ingresá con tu DNI y contraseña.</p>

            {error ? <div className="alert alert-error">{error}</div> : null}

            <form onSubmit={handleSubmit} className="stack" style={{ marginTop: 24 }}>
              <div className="form-field">
                <label htmlFor="dni">DNI</label>
                <input
                  id="dni"
                  inputMode="numeric"
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                  placeholder="12345678"
                  autoComplete="username"
                />
              </div>
              <div className="form-field">
                <label htmlFor="password">Contraseña</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
                {loading ? 'Ingresando…' : 'Ingresar'}
              </button>
            </form>

            <div className="login-apk-download">
              <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
                App móvil para operarios
              </p>
              <ApkDownloadButton variant="light" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
