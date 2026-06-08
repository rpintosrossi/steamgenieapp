// BullMQ queue names — keep centralized to avoid typos
export const QUEUE_NAMES = {
  EVENTS: 'events',
  NOTIFICATIONS: 'notifications',
  PHOTOS: 'photos',
  RESERVATIONS: 'reservations',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
