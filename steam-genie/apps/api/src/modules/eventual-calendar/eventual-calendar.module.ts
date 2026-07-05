import { Module } from '@nestjs/common';
import { EventualCalendarController } from './eventual-calendar.controller';
import { EventualCalendarService } from './eventual-calendar.service';

@Module({
  controllers: [EventualCalendarController],
  providers: [EventualCalendarService],
})
export class EventualCalendarModule {}
