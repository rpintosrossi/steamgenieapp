import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueRegistryService, QUEUE_NAMES } from '../../infrastructure/queues/queue-registry.service';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_JOB_NAME, type NotificationJobPayload } from './notifications.types';

@Injectable()
export class NotificationsProcessor implements OnModuleInit {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly queues: QueueRegistryService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.queues.registerWorker(QUEUE_NAMES.NOTIFICATIONS, (job) => this.handle(job));
    this.logger.log(`Worker registered for queue "${QUEUE_NAMES.NOTIFICATIONS}"`);
  }

  private async handle(job: Job<NotificationJobPayload>): Promise<void> {
    if (job.name !== NOTIFICATION_JOB_NAME) {
      this.logger.warn(`Unknown job name "${job.name}" — skipping`);
      return;
    }
    await this.notificationsService.processJob(job.data);
  }
}
