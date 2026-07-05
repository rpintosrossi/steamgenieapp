import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Sse,
  UseGuards,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, merge, interval, map, filter } from 'rxjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { QueryAttendanceTimelineDto } from './dto/query-attendance-timeline.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { TimelineEventsService } from '../../common/events/timeline-events.service';
import type { AuthUser } from '@steam-genie/shared-types';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly timelineEvents: TimelineEventsService,
  ) {}

  @Post('check-in')
  checkIn(
    @Body() dto: CheckInDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket?.remoteAddress;
    return this.attendanceService.checkIn(user, dto, ip);
  }

  @Post('check-out')
  checkOut(
    @Body() dto: CheckOutDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket?.remoteAddress;
    return this.attendanceService.checkOut(user, dto, ip);
  }

  @Get('today-summary')
  @RequiredRoles('admin', 'manager', 'cleaner')
  findTodaySummary(@CurrentUser() user: AuthUser) {
    return this.attendanceService.findTodaySummary(user.id);
  }

  @Get('last')
  @RequiredRoles('admin', 'manager', 'cleaner')
  findLast(@CurrentUser() user: AuthUser) {
    return this.attendanceService.findLast(user.id);
  }

  @Get('active')
  findActive(@CurrentUser() user: AuthUser) {
    return this.attendanceService.findActive(user.id);
  }

  @Get('timeline')
  @RequiredRoles('admin', 'manager')
  findTimeline(@Query() query: QueryAttendanceTimelineDto) {
    return this.attendanceService.findTimeline(query);
  }

  @Get('timeline/tasks')
  @RequiredRoles('admin', 'manager')
  findTimelineTasks(
    @Query('buildingId', ParseUUIDPipe) buildingId: string,
    @Query('date') date?: string,
  ) {
    return this.attendanceService.findTimelineTasks(buildingId, date);
  }

  /**
   * Server-Sent Events stream of periodic-task activity for the admin timeline.
   * Auth: JWT via Authorization header OR `?access_token=` query param (EventSource cannot set headers).
   * Query filter: optional `buildingId` restricts events to a single building.
   * Heartbeat: every 25s to keep proxies from closing idle connections.
   */
  @Sse('timeline/stream')
  @RequiredRoles('admin', 'manager')
  timelineStream(
    @Query('buildingId') buildingId?: string,
  ): Observable<{ data: unknown; type?: string }> {
    const events$ = this.timelineEvents.stream$.pipe(
      filter((event) => !buildingId || event.buildingId === buildingId),
      map((event) => ({ type: 'timeline', data: event })),
    );

    const heartbeat$ = interval(25_000).pipe(
      map(() => ({
        type: 'heartbeat',
        data: { type: 'HEARTBEAT', at: new Date().toISOString() },
      })),
    );

    return merge(events$, heartbeat$);
  }

  @Get()
  @RequiredRoles('admin', 'manager')
  findAll(@Query() query: QueryAttendanceDto) {
    return this.attendanceService.findAll(query);
  }

  @Post(':id/correct')
  @RequiredRoles('admin', 'manager')
  correct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrectAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attendanceService.correct(id, dto, user);
  }
}
