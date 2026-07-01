import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { RejectionReasonsService } from './rejection-reasons.service';
import { QueryRejectionReasonsDto } from './dto/query-rejection-reasons.dto';
import { CreateRejectionReasonDto } from './dto/create-rejection-reason.dto';
import { UpdateRejectionReasonDto } from './dto/update-rejection-reason.dto';

@Controller('rejection-reasons')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RejectionReasonsController {
  constructor(private readonly rejectionReasonsService: RejectionReasonsService) {}

  @Get()
  @RequiredRoles('admin', 'manager')
  findAll(@Query() query: QueryRejectionReasonsDto) {
    return this.rejectionReasonsService.findAll(query);
  }

  @Post()
  @RequiredRoles('admin', 'manager')
  create(@Body() dto: CreateRejectionReasonDto) {
    return this.rejectionReasonsService.create(dto);
  }

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRejectionReasonDto,
  ) {
    return this.rejectionReasonsService.update(id, dto);
  }

  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rejectionReasonsService.remove(id);
  }
}
