'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api-client';
import type { QuoteInternalPhoto } from '../lib/types';
import { TaskPhotoThumb } from './TaskPhotoThumb';
import type { TaskPhotoGalleryItem } from './TaskPhotoLightbox';

const ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';
const MAX_PHOTOS = 20;

export async function uploadQuoteInternalPhoto(quoteId: string, file: File) {
  return api.upload<QuoteInternalPhoto>(`/quotes/${quoteId}/internal-photos`, file, {
    fieldName: 'photo',
  });
}

function PendingPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!src) {
    return <span className="photo-thumb photo-thumb--loading" aria-label="Cargando vista previa" />;
  }

  return (
    <div className="quote-internal-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={file.name} className="photo-thumb quote-internal-photo-img" />
      <button
        type="button"
        className="quote-internal-photo-remove"
        onClick={onRemove}
        aria-label={`Quitar ${file.name}`}
        title="Quitar"
      >
        ×
      </button>
    </div>
  );
}

export function QuoteInternalPhotos({
  quoteId,
  photos,
  onPhotosChange,
  pendingFiles = [],
  onPendingFilesChange,
  disabled,
  onError,
}: {
  quoteId?: string | null;
  photos: QuoteInternalPhoto[];
  onPhotosChange: (photos: QuoteInternalPhoto[]) => void;
  pendingFiles?: File[];
  onPendingFilesChange?: (files: File[]) => void;
  disabled?: boolean;
  onError?: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const remaining = MAX_PHOTOS - photos.length - pendingFiles.length;
  const canAdd = !disabled && remaining > 0;

  const gallery: TaskPhotoGalleryItem[] = useMemo(
    () =>
      photos.map((photo) => ({
        id: photo.id,
        photoId: photo.id,
        photoUrl: photo.url,
        title: photo.originalFilename ?? 'Observación interna',
        context: {
          uploadedAt: photo.createdAt,
          uploadedByName: photo.uploadedBy?.fullName ?? null,
        },
      })),
    [photos],
  );

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const incoming = Array.from(fileList).slice(0, Math.max(0, remaining));
    if (incoming.length === 0) return;
    onError?.(null);

    if (!quoteId) {
      onPendingFilesChange?.([...pendingFiles, ...incoming]);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setUploading(true);
    const added: QuoteInternalPhoto[] = [];
    let lastError: string | null = null;
    for (const file of incoming) {
      try {
        added.push(await uploadQuoteInternalPhoto(quoteId, file));
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'No se pudo subir la imagen';
      }
    }
    if (added.length) onPhotosChange([...photos, ...added]);
    if (lastError) onError?.(lastError);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function removePhoto(photoId: string) {
    if (!quoteId) return;
    setRemovingId(photoId);
    onError?.(null);
    try {
      await api.delete(`/quotes/${quoteId}/internal-photos/${photoId}`);
      onPhotosChange(photos.filter((photo) => photo.id !== photoId));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'No se pudo quitar la imagen');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="quote-internal-photos">
        {photos.map((photo, index) => (
          <div key={photo.id} className="quote-internal-photo">
            <TaskPhotoThumb
              photoUrl={photo.url}
              photoId={photo.id}
              title={photo.originalFilename ?? 'Observación interna'}
              gallery={gallery}
              galleryIndex={index}
            />
            {!disabled ? (
              <button
                type="button"
                className="quote-internal-photo-remove"
                disabled={removingId === photo.id}
                onClick={() => void removePhoto(photo.id)}
                aria-label="Quitar imagen"
                title="Quitar"
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        {pendingFiles.map((file, index) => (
          <PendingPreview
            key={`${file.name}-${file.lastModified}-${index}`}
            file={file}
            onRemove={() =>
              onPendingFilesChange?.(pendingFiles.filter((_, i) => i !== index))
            }
          />
        ))}
      </div>

      {photos.length === 0 && pendingFiles.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Todavía no hay imágenes internas.
        </p>
      ) : null}

      <div>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept={ACCEPT}
          multiple
          disabled={!canAdd || uploading}
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!canAdd || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Subiendo…' : 'Agregar imágenes'}
        </button>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
          JPEG, PNG, WebP o HEIC. Máx. 8 MB por imagen, hasta {MAX_PHOTOS} fotos.
          No aparecen en el PDF ni se envían al cliente.
        </p>
      </div>
    </div>
  );
}
