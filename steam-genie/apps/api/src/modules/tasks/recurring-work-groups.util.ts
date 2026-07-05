import type { RecurringWorkDisplayStatus } from './dto/query-recurring-work.dto';

export type RecurringWorkGroupStatus =
  | RecurringWorkDisplayStatus
  | 'PARTIAL';

export type RecurringWorkRowLike = {
  building: { id: string; name: string } | null;
  floor: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
  subzone: { id: string; name: string } | null;
  periodLabelDisplay: string;
  displayStatus: RecurringWorkDisplayStatus;
};

export function recurringWorkLocationKey(row: RecurringWorkRowLike): string {
  return [
    row.building?.id ?? '',
    row.floor?.id ?? '',
    row.zone?.id ?? '',
    row.subzone?.id ?? '__no_subzone__',
  ].join('|');
}

export function aggregateRecurringGroupStatus(
  statuses: RecurringWorkDisplayStatus[],
): RecurringWorkGroupStatus {
  const unique = new Set(statuses);

  if (unique.size === 1) {
    const only = [...unique][0];
    return only;
  }

  if (unique.has('OVERDUE')) return 'OVERDUE';

  return 'PARTIAL';
}

function resolvePeriodLabelDisplay(periodLabels: string[]): string {
  const unique = [...new Set(periodLabels)];
  if (unique.length === 1) return unique[0];
  return unique.join(' · ');
}

export function groupRecurringWorkRows<T extends RecurringWorkRowLike>(rows: T[]) {
  const map = new Map<string, T[]>();

  for (const row of rows) {
    const key = recurringWorkLocationKey(row);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }

  return [...map.entries()]
    .map(([key, tasks]) => {
      const sample = tasks[0];
      return {
        key,
        buildingId: sample.building?.id ?? '',
        floorId: sample.floor?.id ?? null,
        zoneId: sample.zone?.id ?? null,
        subzoneId: sample.subzone?.id ?? null,
        building: sample.building,
        floor: sample.floor,
        zone: sample.zone,
        subzone: sample.subzone,
        periodLabelDisplay: resolvePeriodLabelDisplay(
          tasks.map((task) => task.periodLabelDisplay),
        ),
        aggregateStatus: aggregateRecurringGroupStatus(
          tasks.map((task) => task.displayStatus),
        ),
        taskCount: tasks.length,
      };
    })
    .sort((a, b) => {
      const buildingCmp = (a.building?.name ?? '').localeCompare(b.building?.name ?? '', 'es');
      if (buildingCmp !== 0) return buildingCmp;
      const floorCmp = (a.floor?.name ?? '').localeCompare(b.floor?.name ?? '', 'es');
      if (floorCmp !== 0) return floorCmp;
      const zoneCmp = (a.zone?.name ?? '').localeCompare(b.zone?.name ?? '', 'es');
      if (zoneCmp !== 0) return zoneCmp;
      return (a.subzone?.name ?? '').localeCompare(b.subzone?.name ?? '', 'es');
    });
}

export function matchesRecurringWorkLocation<T extends RecurringWorkRowLike>(
  row: T,
  location: {
    buildingId: string;
    floorId: string;
    zoneId: string;
    subzoneId?: string;
  },
): boolean {
  if (row.building?.id !== location.buildingId) return false;
  if (row.floor?.id !== location.floorId) return false;
  if (row.zone?.id !== location.zoneId) return false;

  if (location.subzoneId) {
    return row.subzone?.id === location.subzoneId;
  }

  return !row.subzone?.id;
}
