'use client';

import { useState } from 'react';
import {
  TaskPhotoLightbox,
  type TaskPhotoGalleryItem,
  type TaskPhotoLightboxContext,
} from './TaskPhotoLightbox';
import { AuthenticatedPhotoImage, useAuthenticatedPhotoSrc } from './useAuthenticatedPhotoSrc';

export function TaskPhotoThumb({
  photoUrl,
  photoId,
  title,
  context,
  gallery,
  galleryIndex = 0,
}: {
  photoUrl?: string;
  photoId?: string;
  title?: string | null;
  context?: TaskPhotoLightboxContext;
  /** Si se pasa, el lightbox navega entre todas estas fotos. */
  gallery?: TaskPhotoGalleryItem[];
  galleryIndex?: number;
}) {
  const { src, failed, loading, resolvedUrl } = useAuthenticatedPhotoSrc(photoUrl, photoId);
  const [open, setOpen] = useState(false);

  const galleryItems: TaskPhotoGalleryItem[] =
    gallery && gallery.length > 0
      ? gallery
      : [
          {
            id: photoId ?? photoUrl ?? 'photo',
            photoId,
            photoUrl,
            title,
            context,
          },
        ];

  if (!resolvedUrl) return null;

  if (failed) {
    return (
      <span className="photo-thumb photo-thumb--error" title="No se pudo cargar la foto">
        ?
      </span>
    );
  }

  if (!src || loading) {
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
          items={galleryItems}
          initialIndex={galleryIndex}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

// Re-export for callers that only need the image helper via this module.
export { AuthenticatedPhotoImage };
