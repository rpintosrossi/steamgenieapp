import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { RolesController } from './roles.controller';
import { UsersService } from './users.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [UsersController, RolesController],
  providers: [UsersService, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
