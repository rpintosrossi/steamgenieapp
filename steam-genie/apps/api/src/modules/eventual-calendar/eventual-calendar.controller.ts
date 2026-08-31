import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { EventualCalendarService } from './eventual-calendar.service';
import { QueryEventualCalendarDto } from './dto/query-eventual-calendar.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '@steam-genie/shared-types';

@Controller('eventual-calendar')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventualCalendarController {
  constructor(private readonly eventualCalendarService: EventualCalendarService) {}

  @Get()
  @RequiredRoles('admin', 'manager')
  getEvents(@Query() query: QueryEventualCalendarDto, @CurrentUser() user: AuthUser) {
    return this.eventualCalendarService.getEvents(query, user);
  }

  /** Misma consulta por body: evita URLs enormes con muchos edificios. */
  @Post('query')
  @RequiredRoles('admin', 'manager')
  queryEvents(@Body() body: QueryEventualCalendarDto, @CurrentUser() user: AuthUser) {
    return this.eventualCalendarService.getEvents(body, user);
  }
}
