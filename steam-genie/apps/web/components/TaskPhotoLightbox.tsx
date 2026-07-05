'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LocationDisplay } from './LocationDisplay';

export type TaskPhotoLightboxContext = {
  capturedAt?: string | null;
  uploadedAt?: string | null;
  uploadedByName?: string | null;
  taskName?: string | null;
  buildingName?: string | null;
  floor?: { name: string } | null;
  zone?: { name: string } | null;
  subzone?: { name: string } | null;
};

function formatPhotoDateTime(
  capturedAt?: string | null,
  uploadedAt?: string | null,
): string {
  const value = capturedAt ?? uploadedAt;
  if (!value) return '—';

  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PhotoMetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="photo-lightbox-meta-item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function TaskPhotoLightbox({
  src,
  title,
  context,
  onClose,
}: {
  src: string;
  title?: string | null;
  context?: TaskPhotoLightboxContext;
  onClose: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const hasMeta = Boolean(
    context?.taskName ||
      context?.uploadedByName ||
      context?.capturedAt ||
      context?.uploadedAt ||
      context?.buildingName ||
      context?.floor ||
      context?.zone ||
      context?.subzone,
  );

  return createPortal(
    <div
      className="photo-lightbox-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="photo-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={title ?? context?.taskName ?? 'Foto de tarea'}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="photo-lightbox-close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          ×
        </button>

        <div className="photo-lightbox-layout">
          <div className="photo-lightbox-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={title ?? context?.taskName ?? 'Foto de tarea'} className="photo-lightbox-image" />
          </div>

          {hasMeta ? (
            <aside className="photo-lightbox-sidebar">
              <h3 className="photo-lightbox-sidebar-title">Detalle de la foto</h3>
              <dl className="photo-lightbox-meta">
                <PhotoMetaItem label="Fecha y hora">
                  {formatPhotoDateTime(context?.capturedAt, context?.uploadedAt)}
                </PhotoMetaItem>
                <PhotoMetaItem label="Registrada por">
                  {context?.uploadedByName ?? '—'}
                </PhotoMetaItem>
                <PhotoMetaItem label="Tarea">
                  {context?.taskName ?? '—'}
                </PhotoMetaItem>
                <PhotoMetaItem label="Ubicación">
                  {context?.buildingName ? (
                    <span className="photo-lightbox-building">{context.buildingName}</span>
                  ) : null}
                  <LocationDisplay
                    floor={context?.floor}
                    zone={context?.zone}
                    subzone={context?.subzone}
                  />
                </PhotoMetaItem>
              </dl>
            </aside>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
