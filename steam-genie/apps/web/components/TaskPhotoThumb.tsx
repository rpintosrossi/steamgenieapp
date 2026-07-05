'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchAuthenticatedBlobUrl,
  resolveTaskPhotoUrl,
  taskPhotoNeedsAuthFetch,
} from '../lib/api-client';
import { TaskPhotoLightbox, type TaskPhotoLightboxContext } from './TaskPhotoLightbox';

export function TaskPhotoThumb({
  photoUrl,
  photoId,
  title,
  context,
}: {
  photoUrl?: string;
  photoId?: string;
  title?: string | null;
  context?: TaskPhotoLightboxContext;
}) {
  const resolvedUrl = useMemo(
    () => resolveTaskPhotoUrl(photoUrl, photoId),
    [photoId, photoUrl],
  );

  const requiresAuth = resolvedUrl ? taskPhotoNeedsAuthFetch(resolvedUrl) : false;
  const [src, setSrc] = useState<string | null>(requiresAuth ? null : resolvedUrl || null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let revoked: string | null = null;
    const controller = new AbortController();

    setFailed(false);

    if (!resolvedUrl) {
      setSrc(null);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    if (!requiresAuth) {
      setSrc(resolvedUrl);
      return () => {
        cancelled = true;
      };
    }

    setSrc(null);

    void (async () => {
      const blobUrl = await fetchAuthenticatedBlobUrl(resolvedUrl, controller.signal);
      if (cancelled || controller.signal.aborted) return;

      if (blobUrl) {
        revoked = blobUrl;
        setSrc(blobUrl);
        return;
      }

      setFailed(true);
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [resolvedUrl, requiresAuth]);

  if (!resolvedUrl) return null;

  if (failed) {
    return (
      <span className="photo-thumb photo-thumb--error" title="No se pudo cargar la foto">
        ?
      </span>
    );
  }

  if (!src) {
    return <span className="photo-thumb photo-thumb--loading" aria-label="Cargando foto" />;
  }

  return (
    <>
      <button
        type="button"
        className="photo-thumb-btn"
        onClick={() => setOpen(true)}
        title={title ?? 'Ver foto'}
        aria-label={title ?? 'Ver foto'}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="photo-thumb" />
      </button>
      {open ? (
        <TaskPhotoLightbox
          src={src}
          title={title}
          context={context}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
