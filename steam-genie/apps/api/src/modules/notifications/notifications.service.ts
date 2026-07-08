import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { QueueRegistryService, QUEUE_NAMES } from '../../infrastructure/queues/queue-registry.service';
import {
  getExpoClient,
  isExpoPushToken,
  type ExpoPushMessage,
  type ExpoPushTicket,
} from './expo-push.client';
import {
  NOTIFICATION_JOB_NAME,
  type NotificationData,
  type NotificationJobPayload,
} from './notifications.types';

function stringifyData(data?: NotificationData): Record<string, string> | undefined {
  if (!data) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) result[key] = String(value);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueRegistryService,
  ) {}

  async enqueue(payload: NotificationJobPayload): Promise<void> {
    const userIds = [...new Set(payload.userIds.filter(Boolean))];
    if (userIds.length === 0) return;

    const queue = this.queues.getQueue(QUEUE_NAMES.NOTIFICATIONS);
    await queue.add(
      NOTIFICATION_JOB_NAME,
      { ...payload, userIds },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    );
  }

  async processJob(payload: NotificationJobPayload): Promise<void> {
    const userIds = [...new Set(payload.userIds.filter(Boolean))];
    if (userIds.length === 0) return;

    const devices = await this.prisma.userDevice.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
        pushToken: { not: null },
      },
      select: { id: true, pushToken: true },
    });

    const tokenChecks = await Promise.all(
      devices.map(async (device) => ({
        token: device.pushToken,
        valid: device.pushToken ? await isExpoPushToken(device.pushToken) : false,
      })),
    );

    const tokens = [
      ...new Set(
        tokenChecks
          .filter((row): row is { token: string; valid: true } => row.valid && Boolean(row.token))
          .map((row) => row.token),
      ),
    ];

    if (tokens.length === 0) {
      this.logger.debug(`No push tokens for users: ${userIds.join(', ')}`);
      return;
    }

    const messages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token,
      title: payload.title,
      body: payload.body,
      sound: 'default',
      data: stringifyData(payload.data),
    }));

    const expo = await getExpoClient();
    const invalidTokens: string[] = [];
    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        const chunkTickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);
        chunkTickets.forEach((ticket: ExpoPushTicket, index: number) => {
          if (ticket.status !== 'error') return;
          const detail = ticket.details?.error;
          this.logger.warn(`Push ticket error (${detail ?? 'unknown'}): ${ticket.message}`);
          if (detail === 'DeviceNotRegistered' || detail === 'InvalidCredentials') {
            const token = chunk[index]?.to;
            if (typeof token === 'string') invalidTokens.push(token);
          }
        });
      } catch (error) {
        this.logger.error(
          `Failed to send push chunk: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }

    if (invalidTokens.length === 0) return;

    await this.prisma.userDevice.updateMany({
      where: { pushToken: { in: [...new Set(invalidTokens)] } },
      data: { isActive: false, pushToken: null },
    });
  }

  async resolveUserIdsForBuilding(
    buildingId: string,
    roleNames: string[],
  ): Promise<string[]> {
    const roles = await this.prisma.role.findMany({
      where: { name: { in: roleNames } },
      select: { id: true },
    });
    if (roles.length === 0) return [];

    const roleIds = roles.map((role) => role.id);
    const assignments = await this.prisma.userBuildingRole.findMany({
      where: {
        roleId: { in: roleIds },
        OR: [{ buildingId }, { buildingId: null }],
        user: { isActive: true, deletedAt: null },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    return assignments.map((row) => row.userId);
  }

  async notifyWorkOrderAssigned(params: {
    workOrderId: string;
    title: string;
    buildingName: string;
    userIds: string[];
  }): Promise<void> {
    await this.enqueue({
      userIds: params.userIds,
      title: 'Nueva tarea asignada',
      body: `${params.title} — ${params.buildingName}`,
      data: {
        screen: 'service',
        workOrderId: params.workOrderId,
      },
    });
  }

  async notifyStockAlertCreated(params: {
    alertId: string;
    buildingId: string;
    productName: string;
  }): Promise<void> {
    const userIds = await this.resolveUserIdsForBuilding(params.buildingId, [
      'admin',
      'manager',
    ]);
    if (userIds.length === 0) return;

    await this.enqueue({
      userIds,
      title: 'Alerta de stock',
      body: `Nueva alerta: ${params.productName}`,
      data: {
        screen: 'stock',
        alertId: params.alertId,
        buildingId: params.buildingId,
      },
    });
  }

  async notifyShipmentDispatched(params: {
    reference: string;
    destinations: Array<{ buildingId: string; buildingName: string }>;
  }): Promise<void> {
    for (const destination of params.destinations) {
      const userIds = await this.resolveUserIdsForBuilding(destination.buildingId, [
        'manager',
        'cleaner',
      ]);
      if (userIds.length === 0) continue;

      await this.enqueue({
        userIds,
        title: 'Envío en camino',
        body: `${params.reference} — entrega programada para ${destination.buildingName}`,
        data: {
          screen: 'stock',
          buildingId: destination.buildingId,
        },
      });
    }
  }
}
