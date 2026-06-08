import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { TasksService } from './tasks.service';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { DueTodayQueryDto } from './dto/due-today-query.dto';

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

  @Get()
  @RequiredRoles('admin', 'manager')
  findAll(@Query() query: QueryTasksDto) {
    return this.tasksService.findAll(query);
  }

  @Post()
  @RequiredRoles('admin', 'manager')
  create(@Body() dto: CreateTaskDto) {
    return this.tasksService.create(dto);
  }

  @Get(':id')
  @RequiredRoles('admin', 'manager')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.findOne(id);
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
