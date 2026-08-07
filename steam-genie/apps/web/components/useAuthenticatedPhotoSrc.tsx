'use client';

import { useEffect, useState } from 'react';
import {
  fetchAuthenticatedBlobUrl,
  resolveTaskPhotoUrl,
  taskPhotoNeedsAuthFetch,
} from '../lib/api-client';

export function useAuthenticatedPhotoSrc(photoUrl?: string, photoId?: string) {
  const resolvedUrl = resolveTaskPhotoUrl(photoUrl, photoId);
  const requiresAuth = resolvedUrl ? taskPhotoNeedsAuthFetch(resolvedUrl) : false;
  const [src, setSrc] = useState<string | null>(requiresAuth ? null : resolvedUrl || null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(resolvedUrl && requiresAuth));

  useEffect(() => {
    let cancelled = false;
    let revoked: string | null = null;
    const controller = new AbortController();

    setFailed(false);

    if (!resolvedUrl) {
      setSrc(null);
      setLoading(false);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    if (!requiresAuth) {
      setSrc(resolvedUrl);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setSrc(null);
    setLoading(true);

    void (async () => {
      const blobUrl = await fetchAuthenticatedBlobUrl(resolvedUrl, controller.signal);
      if (cancelled || controller.signal.aborted) return;

      if (blobUrl) {
        revoked = blobUrl;
        setSrc(blobUrl);
        setLoading(false);
        return;
      }

      setFailed(true);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [resolvedUrl, requiresAuth]);

  return { src, failed, loading, resolvedUrl };
}

export function AuthenticatedPhotoImage({
  photoUrl,
  photoId,
  alt,
  className,
  title,
}: {
  photoUrl?: string;
  photoId?: string;
  alt?: string;
  className?: string;
  title?: string;
}) {
  const { src, failed, loading } = useAuthenticatedPhotoSrc(photoUrl, photoId);

  if (failed) {
    return (
      <span className={`${className ?? ''} photo-thumb--error`.trim()} title="No se pudo cargar la foto">
        ?
      </span>
    );
  }

  if (!src || loading) {
    return (
      <span
        className={`${className ?? ''} photo-thumb--loading`.trim()}
        aria-label="Cargando foto"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt ?? ''} className={className} title={title} />
  );
}
