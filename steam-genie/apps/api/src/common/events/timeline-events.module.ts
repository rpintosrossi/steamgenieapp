import { Global, Module } from '@nestjs/common';
import { TimelineEventsService } from './timeline-events.service';

@Global()
@Module({
  providers: [TimelineEventsService],
  exports: [TimelineEventsService],
})
export class TimelineEventsModule {}
