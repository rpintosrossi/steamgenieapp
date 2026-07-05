type SnapshotOption = { id: string; labelSnapshot: string };
type SnapshotField = {
  id: string;
  labelSnapshot: string;
  showInReport: boolean;
  optionSnapshots: SnapshotOption[];
};

type SnapshotFieldValue = {
  selectedOptionIds: string[];
  snapshotField: SnapshotField | null;
};

type MasterField = {
  id: string;
  label: string;
  showInReport: boolean;
  options: Array<{ id: string; label: string }>;
};

type MasterFieldValue = {
  selectedOptionIds: string[];
  masterField: MasterField | null;
};

export type ReportFieldOutput = { label: string; values: string[] };

export function mapSnapshotReportFields(fieldValues: SnapshotFieldValue[]): ReportFieldOutput[] {
  return fieldValues
    .filter((fv) => fv.snapshotField?.showInReport)
    .map((fv) => {
      const field = fv.snapshotField!;
      const labels = field.optionSnapshots
        .filter((opt) => fv.selectedOptionIds.includes(opt.id))
        .map((opt) => opt.labelSnapshot);
      return { label: field.labelSnapshot, values: labels };
    });
}

export function mapMasterReportFields(fieldValues: MasterFieldValue[]): ReportFieldOutput[] {
  return fieldValues
    .filter((fv) => fv.masterField?.showInReport)
    .map((fv) => {
      const field = fv.masterField!;
      const labels = field.options
        .filter((opt) => fv.selectedOptionIds.includes(opt.id))
        .map((opt) => opt.label);
      return { label: field.label, values: labels };
    });
}

export function attendanceDurationMs(
  checkInAt: Date,
  checkOutAt: Date | null,
  asOf: Date = new Date(),
): number {
  const end = checkOutAt ?? asOf;
  return Math.max(0, end.getTime() - checkInAt.getTime());
}
