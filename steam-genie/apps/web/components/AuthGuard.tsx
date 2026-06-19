'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '../lib/auth';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

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
