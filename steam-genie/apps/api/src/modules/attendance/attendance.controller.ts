import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
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
import type { AuthUser } from '@steam-genie/shared-types';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

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
