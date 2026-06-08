import {
  Controller,
  Patch,
  Delete,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { TasksService } from './tasks.service';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { CreateFieldOptionDto } from './dto/create-field-option.dto';

@Controller('custom-fields')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomFieldsController {
  constructor(private readonly tasksService: TasksService) {}

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.tasksService.updateCustomField(id, dto);
  }

  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.removeCustomField(id);
  }

  @Post(':id/options')
  @RequiredRoles('admin', 'manager')
  createOption(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFieldOptionDto,
  ) {
    return this.tasksService.createFieldOption(id, dto);
  }
}
