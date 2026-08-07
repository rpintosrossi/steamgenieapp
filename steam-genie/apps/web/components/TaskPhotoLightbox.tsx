'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LocationDisplay } from './LocationDisplay';
import {
  AuthenticatedPhotoImage,
  useAuthenticatedPhotoSrc,
} from './useAuthenticatedPhotoSrc';

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

export type TaskPhotoGalleryItem = {
  id: string;
  photoId?: string;
  photoUrl?: string;
  title?: string | null;
  context?: TaskPhotoLightboxContext;
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

function GalleryMainImage({ item }: { item: TaskPhotoGalleryItem }) {
  const { src, failed, loading } = useAuthenticatedPhotoSrc(item.photoUrl, item.photoId);
  const alt = item.title ?? item.context?.taskName ?? 'Foto de tarea';

  if (failed) {
    return <div className="photo-lightbox-empty">No se pudo cargar la foto</div>;
  }

  if (!src || loading) {
    return (
      <div className="photo-lightbox-empty" aria-busy="true">
        Cargando…
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="photo-lightbox-image" />
  );
}

export function TaskPhotoLightbox({
  items,
  initialIndex = 0,
  onClose,
}: {
  items: TaskPhotoGalleryItem[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(items.length - 1, 0)),
  );

  const goPrev = useCallback(() => {
    setIndex((current) => {
      if (items.length === 0) return 0;
      return (current - 1 + items.length) % items.length;
    });
  }, [items.length]);

  const goNext = useCallback(() => {
    setIndex((current) => {
      if (items.length === 0) return 0;
      return (current + 1) % items.length;
    });
  }, [items.length]);

  useEffect(() => {
    setIndex(Math.min(Math.max(initialIndex, 0), Math.max(items.length - 1, 0)));
  }, [initialIndex, items.length]);

  useEffect(() => {
    const active = document.querySelector<HTMLElement>(
      '.photo-lightbox-thumb-btn.is-active',
    );
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      }
    }

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [goNext, goPrev, onClose]);

  if (typeof document === 'undefined' || items.length === 0) return null;

  const current = items[index] ?? items[0];
  const context = current.context;
  const title = current.title ?? context?.taskName ?? 'Foto de tarea';
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
  const multi = items.length > 1;

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
        aria-label={title}
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
            {multi ? (
              <button
                type="button"
                className="photo-lightbox-nav photo-lightbox-nav--prev"
                onClick={goPrev}
                aria-label="Foto anterior"
              >
                ‹
              </button>
            ) : null}

            <GalleryMainImage key={current.id} item={current} />

            {multi ? (
              <button
                type="button"
                className="photo-lightbox-nav photo-lightbox-nav--next"
                onClick={goNext}
                aria-label="Foto siguiente"
              >
                ›
              </button>
            ) : null}

            {multi ? (
              <div className="photo-lightbox-counter" aria-live="polite">
                {index + 1} / {items.length}
              </div>
            ) : null}
          </div>

          <aside className="photo-lightbox-sidebar">
            {multi ? (
              <>
                <h3 className="photo-lightbox-sidebar-title">Fotos del servicio</h3>
                <div className="photo-lightbox-thumbs" role="list">
                  {items.map((item, i) => (
                    <button
                      key={item.id}
                      type="button"
                      role="listitem"
                      className={
                        i === index
                          ? 'photo-lightbox-thumb-btn is-active'
                          : 'photo-lightbox-thumb-btn'
                      }
                      onClick={() => setIndex(i)}
                      title={item.title ?? item.context?.taskName ?? `Foto ${i + 1}`}
                      aria-label={item.title ?? item.context?.taskName ?? `Foto ${i + 1}`}
                      aria-current={i === index ? 'true' : undefined}
                    >
                      <AuthenticatedPhotoImage
                        photoId={item.photoId}
                        photoUrl={item.photoUrl}
                        className="photo-lightbox-thumb"
                        alt=""
                      />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <h3 className="photo-lightbox-sidebar-title">Detalle de la foto</h3>
            )}

            {hasMeta ? (
              <dl className={`photo-lightbox-meta${multi ? ' photo-lightbox-meta--compact' : ''}`}>
                {multi ? (
                  <PhotoMetaItem label="Foto">
                    {title}
                  </PhotoMetaItem>
                ) : null}
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
            ) : null}
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
