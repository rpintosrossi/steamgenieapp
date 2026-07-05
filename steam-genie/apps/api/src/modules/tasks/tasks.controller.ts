import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TasksService } from './tasks.service';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { DueTodayQueryDto } from './dto/due-today-query.dto';
import { QueryRecurringWorkDto } from './dto/query-recurring-work.dto';
import { QueryRecurringWorkGroupsDto } from './dto/query-recurring-work-groups.dto';
import { QueryRecurringWorkGroupTasksDto } from './dto/query-recurring-work-group-tasks.dto';
import { MarkTaskDto } from '../service-executions/dto/mark-task.dto';
import { UploadPhotoDto } from '../service-executions/dto/upload-photo.dto';
import type { AuthUser } from '@steam-genie/shared-types';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // NOTE: due-today must be before :id to avoid 'due-today' being parsed as a UUID
  @Get('due-today')
  @RequiredRoles('admin', 'manager', 'cleaner')
  getDueToday(@Query() query: DueTodayQueryDto) {
    return this.tasksService.getDueToday(query);
  }

  @Get('recurring-work/groups')
  @RequiredRoles('admin', 'manager', 'client')
  listRecurringWorkGroups(
    @Query() query: QueryRecurringWorkGroupsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.listRecurringWorkGroups(query, user);
  }

  @Get('recurring-work/group-tasks')
  @RequiredRoles('admin', 'manager', 'client')
  listRecurringWorkGroupTasks(
    @Query() query: QueryRecurringWorkGroupTasksDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.listRecurringWorkGroupTasks(query, user);
  }

  @Get('recurring-work/list')
  @RequiredRoles('admin', 'manager', 'client')
  listRecurringWork(
    @Query() query: QueryRecurringWorkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.listRecurringWork(query, user);
  }

  @Put('instances/:instanceId/mark')
  @RequiredRoles('admin', 'manager', 'cleaner')
  markPeriodicInstance(
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @Body() dto: MarkTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.markPeriodicInstance(instanceId, dto, user);
  }

  @Post('instances/:instanceId/photos')
  @RequiredRoles('admin', 'manager', 'cleaner')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Invalid file type "${file.mimetype}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  uploadPeriodicPhoto(
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPhotoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.uploadPeriodicPhoto(instanceId, file, dto, user);
  }

  @Get()
  @RequiredRoles('admin', 'manager', 'client')
  findAll(@Query() query: QueryTasksDto, @CurrentUser() user: AuthUser) {
    return this.tasksService.findAll(query, user);
  }

  @Post()
  @RequiredRoles('admin', 'manager')
  create(@Body() dto: CreateTaskDto) {
    return this.tasksService.create(dto);
  }

  @Get(':id')
  @RequiredRoles('admin', 'manager', 'client')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.tasksService.findOne(id, user);
  }

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.remove(id);
  }

  @Post(':id/custom-fields')
  @RequiredRoles('admin', 'manager')
  createCustomField(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCustomFieldDto,
  ) {
    return this.tasksService.createCustomField(id, dto);
  }
}
