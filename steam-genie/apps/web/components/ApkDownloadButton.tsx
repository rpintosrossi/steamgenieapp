'use client';

import { useEffect, useState } from 'react';

type ApkInfo = {
  version: string;
  versionCode: number;
  filename: string;
  updatedAt?: string;
};

type ApkDownloadButtonProps = {
  /** `light` para fondos claros (login); `sidebar` para la barra lateral oscura. */
  variant?: 'light' | 'sidebar';
  className?: string;
};

export function ApkDownloadButton({ variant = 'light', className = '' }: ApkDownloadButtonProps) {
  const [info, setInfo] = useState<ApkInfo | null>(null);
  const [apkAvailable, setApkAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const infoRes = await fetch('/downloads/apk-info.json', { cache: 'no-store' });
        if (!infoRes.ok) return;

        const data = (await infoRes.json()) as ApkInfo;
        if (!data?.version || !data.filename) return;

        const apkRes = await fetch(`/downloads/${data.filename}`, { method: 'HEAD' });

        if (!cancelled) {
          setInfo(data);
          setApkAvailable(apkRes.ok);
        }
      } catch {
        /* sin APK publicada */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !info) return null;

  const label = `Descargar app Android v${info.version} (build ${info.versionCode})`;

  if (!apkAvailable) {
    return (
      <div className={`apk-download apk-download--${variant} apk-download--unavailable ${className}`.trim()}>
        <span className="apk-download__icon" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <line x1="12" y1="18" x2="12" y2="18.01" />
          </svg>
        </span>
        <span className="apk-download__text">
          <span className="apk-download__label">App Android v{info.version}</span>
          <span className="apk-download__hint">APK no disponible todavía</span>
        </span>
      </div>
    );
  }

  return (
    <a
      href={`/downloads/${info.filename}`}
      download={info.filename}
      className={`apk-download apk-download--${variant} ${className}`.trim()}
    >
      <span className="apk-download__icon" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </span>
      <span className="apk-download__text">
        <span className="apk-download__label">{label}</span>
        {info.updatedAt ? (
          <span className="apk-download__hint">Actualizada el {formatDate(info.updatedAt)}</span>
        ) : null}
      </span>
    </a>
  );
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
