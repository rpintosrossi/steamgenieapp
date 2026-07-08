export type NotificationScreen =
  | 'service'
  | 'stock'
  | 'tareas'
  | 'services';

export type NotificationData = {
  screen?: NotificationScreen;
  workOrderId?: string;
  alertId?: string;
  buildingId?: string;
  [key: string]: string | undefined;
};

export type NotificationJobPayload = {
  userIds: string[];
  title: string;
  body: string;
  data?: NotificationData;
};

export const NOTIFICATION_JOB_NAME = 'send-push' as const;
