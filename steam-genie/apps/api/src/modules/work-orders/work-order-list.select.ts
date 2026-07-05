export const WORK_ORDER_LIST_SELECT = {
  id: true,
  type: true,
  status: true,
  title: true,
  buildingId: true,
  zoneId: true,
  subzoneId: true,
  scheduledDate: true,
  scheduledTime: true,
  deadlineAt: true,
  createdAt: true,
  building: { select: { id: true, name: true } },
  zone: { select: { id: true, name: true } },
  assignments: {
    select: {
      id: true,
      userId: true,
      status: true,
      user: { select: { id: true, fullName: true, dni: true } },
    },
  },
  _count: { select: { workOrderTasks: true, assignments: true } },
} as const;
