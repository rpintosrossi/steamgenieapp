import { Module } from '@nestjs/common';
import { ServiceExecutionsController } from './service-executions.controller';
import { ServiceExecutionsService } from './service-executions.service';

// StorageService is provided globally by StorageModule (@Global in app.module.ts)

@Module({
  controllers: [ServiceExecutionsController],
  providers: [ServiceExecutionsService],
  exports: [ServiceExecutionsService],
})
export class ServiceExecutionsModule {}
