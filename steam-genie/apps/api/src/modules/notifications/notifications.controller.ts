import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '@steam-genie/shared-types';
import { NotificationsService } from './notifications.service';
import { EnqueueNotificationDto, SendTestNotificationDto } from './dto/notification.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('test')
  @RequiredRoles('admin', 'manager')
  async sendTest(
    @Body() dto: SendTestNotificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    const targetUserId = dto.userId ?? user.id;
    await this.notificationsService.enqueue({
      userIds: [targetUserId],
      title: dto.title,
      body: dto.body,
      data: dto.data,
    });
    return { queued: true, userId: targetUserId };
  }

  @Post('enqueue')
  @RequiredRoles('admin')
  async enqueue(@Body() dto: EnqueueNotificationDto) {
    await this.notificationsService.enqueue(dto);
    return { queued: true, userCount: dto.userIds.length };
  }
}
