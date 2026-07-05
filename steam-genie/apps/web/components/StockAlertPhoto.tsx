'use client';

import { useEffect, useState } from 'react';
import { getAccessTokenForStream, getApiBaseUrl } from '../lib/api-client';

function needsAuthFetch(photoUrl: string): boolean {
  try {
    const path = new URL(photoUrl, getApiBaseUrl()).pathname;
    return path.includes('/stock-logistics/alerts/') && path.endsWith('/photo');
  } catch {
    return photoUrl.includes('/stock-logistics/alerts/') && photoUrl.endsWith('/photo');
  }
}

async function fetchAuthenticatedBlobUrl(
  photoUrl: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const token = getAccessTokenForStream();
  if (!token) return null;

  const absoluteUrl = photoUrl.startsWith('http')
    ? photoUrl
    : `${getApiBaseUrl()}${photoUrl}`;

  const res = await fetch(absoluteUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) return null;

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function StockAlertPhoto({ photoUrl }: { photoUrl: string }) {
  const requiresAuth = needsAuthFetch(photoUrl);
  const [src, setSrc] = useState<string | null>(requiresAuth ? null : photoUrl);
  const [loading, setLoading] = useState(requiresAuth);

  useEffect(() => {
    if (!requiresAuth) {
      setSrc(photoUrl);
      setLoading(false);
      return;
    }

    let revoked: string | null = null;
    const controller = new AbortController();

    void fetchAuthenticatedBlobUrl(photoUrl, controller.signal).then((blobUrl) => {
      if (controller.signal.aborted) return;
      if (blobUrl) {
        revoked = blobUrl;
        setSrc(blobUrl);
      }
      setLoading(false);
    });

    return () => {
      controller.abort();
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [photoUrl, requiresAuth]);

  if (loading) {
    return <span className="monitoring-alert-photo-loading">Cargando foto…</span>;
  }
  if (!src) return null;

  return (
    <button
      type="button"
      className="monitoring-alert-photo-btn"
      onClick={(e) => {
        e.stopPropagation();
        window.open(src, '_blank', 'noopener,noreferrer');
      }}
      title="Ver foto adjunta"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Foto del reporte de stock" className="monitoring-alert-photo" />
    </button>
  );
}
