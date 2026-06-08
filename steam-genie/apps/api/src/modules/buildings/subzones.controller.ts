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
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { BuildingsService } from './buildings.service';
import { UpdateSubzoneDto } from './dto/update-subzone.dto';

@Controller('subzones')
@UseGuards(JwtAuthGuard, RolesGuard, BuildingAccessGuard)
export class SubzonesController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSubzoneDto) {
    return this.buildingsService.updateSubzone(id, dto);
  }

  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.buildingsService.removeSubzone(id);
  }
}
