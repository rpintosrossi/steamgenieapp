import type { TaskFrequency } from '@prisma/client';

export type BulkImportRowStatus = 'success' | 'error' | 'skipped';

export interface BulkImportRowInterpretation {
  building: string;
  buildingId: string;
  floor: string;
  floorCreated: boolean;
  zone: string;
  zoneCreated: boolean;
  subzone?: string;
  subzoneCreated?: boolean;
  task?: string;
  taskCreated?: boolean;
  taskSkipped?: boolean;
  frequency?: TaskFrequency;
  startDate?: string;
}

export interface BulkImportRowResult {
  row: number;
  status: BulkImportRowStatus;
  message: string;
  interpretation?: BulkImportRowInterpretation;
}

export interface BulkImportSummary {
  buildingsTouched: string[];
  floorsCreated: number;
  zonesCreated: number;
  subzonesCreated: number;
  tasksCreated: number;
  tasksSkipped: number;
}

export interface BulkImportResult {
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  rows: BulkImportRowResult[];
  summary: BulkImportSummary;
}

export interface ParsedImportRow {
  rowNumber: number;
  buildingName: string;
  floorName: string;
  zoneName: string;
  subzoneName?: string;
  taskName?: string;
  frequencyRaw?: string;
  startDateRaw?: unknown;
  requiresPhoto?: boolean;
  allowsObservation?: boolean;
  requiresRejectionReason?: boolean;
}
