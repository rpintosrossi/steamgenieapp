import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BuildingsModule } from './modules/buildings/buildings.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { ServiceExecutionsModule } from './modules/service-executions/service-executions.module';
import { SyncModule } from './modules/sync/sync.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditModule } from './modules/audit/audit.module';
import { TaskPhotosModule } from './modules/task-photos/task-photos.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '../../../.env'),
    }),
    PrismaModule,
    StorageModule,
    HealthModule,
    AuthModule,
    UsersModule,
    BuildingsModule,
    AttendanceModule,
    TasksModule,
    ReservationsModule,
    WorkOrdersModule,
    ServiceExecutionsModule,
    SyncModule,
    NotificationsModule,
    IntegrationsModule,
    DashboardModule,
    AuditModule,
    TaskPhotosModule,
  ],
})
export class AppModule {}
