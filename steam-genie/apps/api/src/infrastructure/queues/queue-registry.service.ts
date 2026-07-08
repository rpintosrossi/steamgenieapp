import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { QUEUE_NAMES, type QueueName } from './queue.constants';

type JobProcessor = (job: Job) => Promise<void>;

@Injectable()
export class QueueRegistryService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueRegistryService.name);
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];

  getQueue(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const queue = new Queue(name, { connection: getRedisConnection() });
    this.queues.set(name, queue);
    return queue;
  }

  registerWorker(name: QueueName, processor: JobProcessor): Worker {
    const worker = new Worker(name, processor, {
      connection: getRedisConnection(),
      concurrency: 5,
    });

    worker.on('failed', (job, error) => {
      this.logger.error(
        `Job ${job?.id ?? '?'} in queue "${name}" failed: ${error.message}`,
        error.stack,
      );
    });

    this.workers.push(worker);
    return worker;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      ...this.workers.map((worker) => worker.close()),
      ...[...this.queues.values()].map((queue) => queue.close()),
    ]);
  }
}

export { QUEUE_NAMES };
