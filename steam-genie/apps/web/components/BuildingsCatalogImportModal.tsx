'use client';

import { useRef, useState } from 'react';
import { api } from '../lib/api-client';

type CatalogImportRow = {
  row: number;
  status: 'success' | 'error' | 'skipped';
  message: string;
  buildingName?: string;
  buildingId?: string;
  geocoded?: boolean;
};

type CatalogImportResult = {
  totalRows: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  skipAddressLookup: boolean;
  requireGpsValidation: boolean;
  rows: CatalogImportRow[];
};

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
};

function statusBadgeClass(status: string): string {
  if (status === 'success') return 'badge badge-success';
  if (status === 'skipped') return 'badge badge-warning';
  return 'badge badge-error';
}

function statusLabel(status: string): string {
  if (status === 'success') return 'OK';
  if (status === 'skipped') return 'Omitido';
  return 'Error';
}

export function BuildingsCatalogImportModal({ onClose, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [skipAddressLookup, setSkipAddressLookup] = useState(true);
  const [requireGpsValidation, setRequireGpsValidation] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CatalogImportResult | null>(null);

  async function handleDownloadTemplate() {
    setDownloading(true);
    setError(null);
    try {
      await api.download(
        '/bulk-import/buildings-catalog/template',
        'plantilla-edificios.xlsx',
      );
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
      const params = new URLSearchParams({
        skipAddressLookup: skipAddressLookup ? 'true' : 'false',
        requireGpsValidation: requireGpsValidation ? 'true' : 'false',
      });
      const response = await api.upload<CatalogImportResult>(
        `/bulk-import/buildings-catalog/excel?${params}`,
        selectedFile,
      );
      setResult(response);
      if (response.successCount > 0) {
        onSuccess?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el archivo');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Importar edificios (Excel)</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Creá varios edificios de una vez. Descargá la plantilla, completá filas y subí el
          archivo.
        </p>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-actions" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={downloading}
              onClick={() => void handleDownloadTemplate()}
            >
              {downloading ? 'Descargando…' : 'Descargar plantilla'}
            </button>
          </div>

          <label className="checkbox-item" style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
            <input
              type="checkbox"
              checked={skipAddressLookup}
              onChange={(e) => setSkipAddressLookup(e.target.checked)}
            />
            <span>
              <strong>No buscar dirección</strong>
              <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                Guarda nombre/dirección/ciudad/provincia tal cual, sin geocodificar.
              </span>
            </span>
          </label>

          <label className="checkbox-item" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
            <input
              type="checkbox"
              checked={requireGpsValidation}
              onChange={(e) => setRequireGpsValidation(e.target.checked)}
            />
            <span>
              <strong>Validar GPS al fichar (para todos)</strong>
              <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                Si está marcado, todos los edificios importados exigirán estar dentro del radio
                GPS. Si no, ninguno validará GPS al fichar.
              </span>
            </span>
          </label>

          <div className="form-field">
            <label htmlFor="buildings-excel">Archivo Excel</label>
            <input
              id="buildings-excel"
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setSelectedFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
          </div>

          <div className="form-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={uploading || !selectedFile}
              onClick={() => void handleUpload()}
            >
              {uploading ? 'Importando…' : 'Importar edificios'}
            </button>
          </div>
        </div>

        {result ? (
          <div className="card">
            <h3 className="card-title">Resultado</h3>
            <p className="muted">
              Filas: {result.totalRows} · OK: {result.successCount} · Omitidos:{' '}
              {result.skippedCount} · Errores: {result.errorCount}
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              Opciones usadas:{' '}
              {result.skipAddressLookup ? 'sin búsqueda de dirección' : 'con geocodificación'} ·{' '}
              {result.requireGpsValidation ? 'valida GPS' : 'sin validación GPS'}
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Estado</th>
                    <th>Edificio</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={`${row.row}-${row.buildingName ?? ''}`}>
                      <td>{row.row}</td>
                      <td>
                        <span className={statusBadgeClass(row.status)}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td>{row.buildingName ?? '—'}</td>
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
  );
}
