import {
  Controller,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { TasksService } from './tasks.service';
import { UpdateFieldOptionDto } from './dto/update-field-option.dto';

@Controller('custom-field-options')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FieldOptionsController {
  constructor(private readonly tasksService: TasksService) {}

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFieldOptionDto) {
    return this.tasksService.updateFieldOption(id, dto);
  }

  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.removeFieldOption(id);
  }
}
