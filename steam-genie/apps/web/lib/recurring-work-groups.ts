import type { RecurringWorkGroupSummary, RecurringWorkListItem } from './types';

export type RecurringWorkGroupStatus = 'COMPLETED' | 'SCHEDULED' | 'OVERDUE' | 'PARTIAL';

export const RECURRING_WORK_GROUP_STATUS_LABELS: Record<RecurringWorkGroupStatus, string> = {
  COMPLETED: 'Completado',
  SCHEDULED: 'Programado',
  OVERDUE: 'Vencido',
  PARTIAL: 'En curso',
};

export const RECURRING_WORK_GROUP_STATUS_BADGE: Record<RecurringWorkGroupStatus, string> = {
  COMPLETED: 'badge-success',
  SCHEDULED: 'badge-info',
  OVERDUE: 'badge-warning',
  PARTIAL: 'badge-info',
};

/** @deprecated Usar RecurringWorkGroupSummary desde la API de grupos paginados. */
export interface RecurringWorkLocationGroup extends RecurringWorkGroupSummary {
  tasks: RecurringWorkListItem[];
}

function locationKey(item: RecurringWorkListItem): string {
  return [
    item.building?.id ?? '',
    item.floor?.id ?? '',
    item.zone?.id ?? '',
    item.subzone?.id ?? '__no_subzone__',
  ].join('|');
}

export function aggregateGroupStatus(
  tasks: RecurringWorkListItem[],
): RecurringWorkGroupStatus {
  const statuses = new Set(tasks.map((task) => task.displayStatus));

  if (statuses.size === 1) {
    const only = [...statuses][0];
    if (only === 'COMPLETED' || only === 'SCHEDULED' || only === 'OVERDUE') return only;
  }

  if (statuses.has('OVERDUE')) return 'OVERDUE';

  return 'PARTIAL';
}

function resolvePeriodLabelDisplay(tasks: RecurringWorkListItem[]): string {
  const labels = [...new Set(tasks.map((task) => task.periodLabelDisplay))];
  if (labels.length === 1) return labels[0];
  return labels.join(' · ');
}

export function groupRecurringWorkItems(
  items: RecurringWorkListItem[],
): RecurringWorkLocationGroup[] {
  const map = new Map<string, RecurringWorkListItem[]>();

  for (const item of items) {
    const key = locationKey(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }

  return [...map.entries()]
    .map(([key, tasks]) => ({
      key,
      buildingId: tasks[0]?.building?.id ?? '',
      floorId: tasks[0]?.floor?.id ?? null,
      zoneId: tasks[0]?.zone?.id ?? null,
      subzoneId: tasks[0]?.subzone?.id ?? null,
      building: tasks[0]?.building ?? null,
      floor: tasks[0]?.floor ?? null,
      zone: tasks[0]?.zone ?? null,
      subzone: tasks[0]?.subzone ?? null,
      periodLabelDisplay: resolvePeriodLabelDisplay(tasks),
      aggregateStatus: aggregateGroupStatus(tasks),
      taskCount: tasks.length,
      tasks: tasks.sort((a, b) => a.taskName.localeCompare(b.taskName, 'es')),
    }))
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

export function filterGroupsByStatus(
  groups: RecurringWorkLocationGroup[],
  status: string,
): RecurringWorkLocationGroup[] {
  if (!status) return groups;
  return groups.filter((group) => group.aggregateStatus === status);
}
