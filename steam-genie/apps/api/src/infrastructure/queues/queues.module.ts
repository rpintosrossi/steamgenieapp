import { Global, Module } from '@nestjs/common';
import { QueueRegistryService } from './queue-registry.service';

@Global()
@Module({
  providers: [QueueRegistryService],
  exports: [QueueRegistryService],
})
export class QueuesModule {}
