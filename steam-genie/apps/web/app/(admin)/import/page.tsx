'use client';

import { useRef, useState } from 'react';
import { api } from '../../../lib/api-client';
import { TASK_FREQUENCY_LABELS } from '../../../lib/labels';
import type { BulkImportResult } from '../../../lib/types';

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
    `Edificio: ${i.building}`,
    `Planta: ${i.floor}${i.floorCreated ? ' (nueva)' : ''}`,
    `Zona: ${i.zone}${i.zoneCreated ? ' (nueva)' : ''}`,
  ];

  if (i.subzone) {
    parts.push(`Subzona: ${i.subzone}${i.subzoneCreated ? ' (nueva)' : ''}`);
  }

  if (i.task) {
    const freq = i.frequency ? (TASK_FREQUENCY_LABELS[i.frequency] ?? i.frequency) : '';
    parts.push(
      `Tarea: ${i.task}${i.taskCreated ? ' (creada)' : i.taskSkipped ? ' (ya existía)' : ''}${freq ? ` · ${freq}` : ''}`,
    );
  }

  return parts.join(' · ');
}

export default function BulkImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  async function handleDownloadTemplate() {
    setDownloading(true);
    setError(null);
    try {
      await api.download('/bulk-import/template', 'plantilla-carga-masiva.xlsx');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar la plantilla');
    } finally {
      setDownloading(false);
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
      const response = await api.upload<BulkImportResult>('/bulk-import/excel', selectedFile);
      setResult(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar el archivo');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Importación masiva</h1>
          <p className="page-subtitle">
            Cargá estructura (plantas, zonas, subzonas) y tareas de varios edificios desde un
            único Excel. El edificio se identifica por nombre; lo demás se crea si no existe.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <h2 className="card-title">1. Descargar plantilla</h2>
        <p className="muted">
          La plantilla incluye columnas en español, filas de ejemplo e instrucciones en una segunda
          hoja. El edificio debe existir previamente en el sistema.
        </p>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleDownloadTemplate()}
            disabled={downloading}
          >
            {downloading ? 'Descargando…' : 'Descargar plantilla Excel'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">2. Subir archivo completado</h2>
        <p className="muted">
          Podés mezclar varios edificios en el mismo archivo. Cada fila se procesa de forma
          independiente: si una falla, las demás igual se importan.
        </p>

        <div className="stack" style={{ marginTop: 16 }}>
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
            <p className="muted" style={{ margin: 0 }}>
              Archivo seleccionado: <strong>{selectedFile.name}</strong> (
              {(selectedFile.size / 1024).toFixed(1)} KB)
            </p>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleUpload()}
              disabled={uploading || !selectedFile}
            >
              {uploading ? 'Procesando…' : 'Importar archivo'}
            </button>
          </div>
        </div>
      </div>

      {result ? (
        <div className="card">
          <h2 className="card-title">Resultado de la importación</h2>

          <div className="grid-3" style={{ marginBottom: 20 }}>
            <div className="summary-stat">
              <span className="summary-stat-value">{result.totalRows}</span>
              <span className="summary-stat-label">Filas procesadas</span>
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

          <div className="grid-3" style={{ marginBottom: 20 }}>
            <div className="summary-stat">
              <span className="summary-stat-value">{result.summary.floorsCreated}</span>
              <span className="summary-stat-label">Plantas creadas</span>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-value">{result.summary.zonesCreated}</span>
              <span className="summary-stat-label">Zonas creadas</span>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-value">{result.summary.subzonesCreated}</span>
              <span className="summary-stat-label">Subzonas creadas</span>
            </div>
          </div>

          <p className="muted">
            Tareas creadas: <strong>{result.summary.tasksCreated}</strong>
            {result.summary.tasksSkipped > 0 ? (
              <>
                {' '}
                · Omitidas (ya existían): <strong>{result.summary.tasksSkipped}</strong>
              </>
            ) : null}
            {result.summary.buildingsTouched.length > 0 ? (
              <>
                {' '}
                · Edificios: {result.summary.buildingsTouched.join(', ')}
              </>
            ) : null}
          </p>

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Estado</th>
                  <th>Interpretación</th>
                  <th>Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>
                      <span className={statusBadgeClass(row.status)}>{statusLabel(row.status)}</span>
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
    </>
  );
}
