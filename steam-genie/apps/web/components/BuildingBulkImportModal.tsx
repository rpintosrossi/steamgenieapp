'use client';

import { useRef, useState } from 'react';
import { api } from '../lib/api-client';
import { TASK_FREQUENCY_LABELS } from '../lib/labels';
import type { BulkImportResult } from '../lib/types';

function statusBadgeClass(status: string): string {
  if (status === 'success') return 'badge badge-success';
  if (status === 'skipped') return 'badge badge-warning';
  return 'badge badge-error';
}

function statusLabel(status: string): string {
  if (status === 'success') return 'OK';
  if (status === 'skipped') return 'Omitida';
  return 'Error';
}

function formatInterpretation(result: BulkImportResult['rows'][number]): string {
  const i = result.interpretation;
  if (!i) return '—';

  const parts: string[] = [
    `Planta: ${i.floor}${i.floorCreated ? ' (nueva)' : ''}`,
    `Zona: ${i.zone}${i.zoneCreated ? ' (nueva)' : ''}`,
  ];

  if (i.subzone) {
    parts.push(`Subzona: ${i.subzone}${i.subzoneCreated ? ' (nueva)' : ''}`);
  }

  if (i.task) {
    const freq = i.frequency ? (TASK_FREQUENCY_LABELS[i.frequency] ?? i.frequency) : '';
    const taskStatus = i.taskCreated
      ? ' (creada)'
      : i.taskUpdated
        ? ' (actualizada)'
        : i.taskSkipped
          ? ' (sin cambios)'
          : '';
    parts.push(`Tarea: ${i.task}${taskStatus}${freq ? ` · ${freq}` : ''}`);
  }

  return parts.join(' · ');
}

type BuildingBulkImportModalProps = {
  buildingId: string;
  buildingName: string;
  onClose: () => void;
  onSuccess?: () => void;
};

export function BuildingBulkImportModal({
  buildingId,
  buildingName,
  onClose,
  onSuccess,
}: BuildingBulkImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<'empty' | 'current' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  async function handleDownloadTemplate(mode: 'empty' | 'current') {
    setDownloading(mode);
    setError(null);
    try {
      const filename =
        mode === 'empty'
          ? `plantilla-vacia-${buildingName}.xlsx`
          : `plantilla-${buildingName}.xlsx`;
      await api.download(
        `/bulk-import/buildings/${buildingId}/template?mode=${mode}`,
        filename,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar la plantilla');
    } finally {
      setDownloading(null);
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError('Seleccioná un archivo Excel (.xlsx).');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const response = await api.upload<BulkImportResult>(
        `/bulk-import/buildings/${buildingId}/excel`,
        selectedFile,
      );
      setResult(response);
      if (response.successCount > 0 || response.summary.tasksUpdated > 0) {
        onSuccess?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar el archivo');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 720, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">Importar Excel</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Cargá o actualizá la estructura y las tareas de <strong>{buildingName}</strong> desde un
          archivo Excel. Si volvés a subir la plantilla con datos actuales, solo se aplican filas
          nuevas o modificadas; lo existente no se duplica.
        </p>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className="stack" style={{ gap: 16 }}>
          <div>
            <h3 className="card-title" style={{ fontSize: '1rem', marginBottom: 8 }}>
              Descargar plantilla
            </h3>
            <div className="form-actions" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void handleDownloadTemplate('current')}
                disabled={downloading !== null}
              >
                {downloading === 'current' ? 'Descargando…' : 'Con datos actuales'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void handleDownloadTemplate('empty')}
                disabled={downloading !== null}
              >
                {downloading === 'empty' ? 'Descargando…' : 'Plantilla vacía'}
              </button>
            </div>
          </div>

          <div>
            <h3 className="card-title" style={{ fontSize: '1rem', marginBottom: 8 }}>
              Subir archivo
            </h3>
            <div className="form-field">
              <label>Archivo Excel</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onClick={(e) => {
                  (e.target as HTMLInputElement).value = '';
                }}
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] ?? null);
                  setResult(null);
                  setError(null);
                }}
              />
            </div>

            {selectedFile ? (
              <p className="muted" style={{ margin: '8px 0 0' }}>
                Archivo: <strong>{selectedFile.name}</strong> (
                {(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            ) : null}

            <div className="form-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void handleUpload()}
                disabled={uploading || !selectedFile}
              >
                {uploading ? 'Procesando…' : 'Importar archivo'}
              </button>
            </div>
          </div>

          {result ? (
            <div>
              <h3 className="card-title" style={{ fontSize: '1rem', marginBottom: 8 }}>
                Resultado
              </h3>

              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div className="summary-stat">
                  <span className="summary-stat-value">{result.totalRows}</span>
                  <span className="summary-stat-label">Filas</span>
                </div>
                <div className="summary-stat">
                  <span className="summary-stat-value" style={{ color: 'var(--color-success)' }}>
                    {result.successCount}
                  </span>
                  <span className="summary-stat-label">Correctas</span>
                </div>
                <div className="summary-stat">
                  <span className="summary-stat-value" style={{ color: 'var(--color-error)' }}>
                    {result.errorCount}
                  </span>
                  <span className="summary-stat-label">Con error</span>
                </div>
              </div>

              <p className="muted" style={{ margin: '0 0 12px' }}>
                Plantas: {result.summary.floorsCreated} nuevas · Zonas:{' '}
                {result.summary.zonesCreated} nuevas · Subzonas:{' '}
                {result.summary.subzonesCreated} nuevas
                <br />
                Tareas: {result.summary.tasksCreated} creadas
                {result.summary.tasksUpdated > 0 ? (
                  <> · {result.summary.tasksUpdated} actualizadas</>
                ) : null}
                {result.summary.tasksSkipped > 0 ? (
                  <> · {result.summary.tasksSkipped} sin cambios</>
                ) : null}
              </p>

              <div className="table-wrap" style={{ maxHeight: 280, overflow: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Estado</th>
                      <th>Detalle</th>
                      <th>Mensaje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => (
                      <tr key={row.row}>
                        <td>{row.row}</td>
                        <td>
                          <span className={statusBadgeClass(row.status)}>
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td>{formatInterpretation(row)}</td>
                        <td>{row.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
