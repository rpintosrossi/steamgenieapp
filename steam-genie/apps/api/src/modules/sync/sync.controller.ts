import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SyncService } from './sync.service';
import { PrefetchQueryDto } from './dto/prefetch-query.dto';
import { SyncBatchDto } from './dto/sync-batch.dto';
import type { AuthUser } from '@steam-genie/shared-types';

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * Returns the minimum dataset the mobile app needs to work offline
   * in a specific building.
   * GET /sync/prefetch?buildingId=<uuid>
   */
  @Get('prefetch')
  prefetch(
    @Query() query: PrefetchQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.syncService.prefetch(query, user);
  }

  /**
   * Processes a batch of offline operations idempotently.
   * POST /sync/batch
   */
  @Post('batch')
  batch(
    @Body() dto: SyncBatchDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress;
    return this.syncService.processBatch(dto, user, ip);
  }
}
