import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

export type TimelineEventType =
  | 'PERIODIC_INSTANCE_MARKED'
  | 'PERIODIC_INSTANCE_RESET';

export interface TimelineEvent {
  type: TimelineEventType;
  /** Building this event belongs to (used for SSE filtering). */
  buildingId: string;
  /** Business date (YYYY-MM-DD in America/Argentina/Buenos_Aires). */
  date: string;
  /** Periodic instance affected. */
  instanceId: string;
  taskId: string;
  /** New instance status: 'PENDING' | 'COMPLETED' | 'EXPIRED'. */
  instanceStatus: string;
  /** Task execution info (present when marked). */
  execution?: {
    id: string;
    /** 'DONE' | 'NOT_DONE' | 'SKIPPED' */
    status: string;
    executedAt: string;
    executedBy: { id: string; fullName: string; dni: string };
    /** Free-text observation left by the worker. */
    observation?: string | null;
    /** Rejection reason when status === 'NOT_DONE'. */
    rejectionReason?: { id: string; reason: string } | null;
  } | null;
  emittedAt: string;
}

/**
 * Singleton in-process event bus for the admin presence timeline.
 * Fires when a periodic task instance is marked (done / not-done / N-A).
 * Consumed by the SSE endpoint `GET /attendance/timeline/stream`.
 *
 * NOTE: In-process only. Multi-instance deployments would require Redis pub/sub.
 */
@Injectable()
export class TimelineEventsService {
  private readonly logger = new Logger(TimelineEventsService.name);
  private readonly subject = new Subject<TimelineEvent>();

  /** Observable stream — subscribers get every event fired after subscription. */
  readonly stream$ = this.subject.asObservable();

  emit(event: Omit<TimelineEvent, 'emittedAt'>): void {
    const enriched: TimelineEvent = { ...event, emittedAt: new Date().toISOString() };
    this.logger.debug(
      `emit ${enriched.type} building=${enriched.buildingId} instance=${enriched.instanceId}`,
    );
    this.subject.next(enriched);
  }
}
