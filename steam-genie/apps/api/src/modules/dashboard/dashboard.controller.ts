import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '@steam-genie/shared-types';
import { DashboardService } from './dashboard.service';
import { QueryDashboardStatsDto } from './dto/query-dashboard-stats.dto';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  getStats(@Query() query: QueryDashboardStatsDto, @CurrentUser() user: AuthUser) {
    return this.dashboardService.getStats(query, user);
  }
}
