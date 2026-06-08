import { Module } from '@nestjs/common';
import { ServiceExecutionsController } from './service-executions.controller';
import { ServiceExecutionsService } from './service-executions.service';

@Module({ controllers: [ServiceExecutionsController], providers: [ServiceExecutionsService], exports: [ServiceExecutionsService] })
export class ServiceExecutionsModule {}
