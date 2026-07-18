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
import { ParticularClientsService } from './particular-clients.service';
import { QueryParticularClientsDto } from './dto/query-particular-clients.dto';
import { CreateParticularClientDto } from './dto/create-particular-client.dto';
import { UpdateParticularClientDto } from './dto/update-particular-client.dto';

@Controller('particular-clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParticularClientsController {
  constructor(private readonly particularClientsService: ParticularClientsService) {}

  @Get()
  @RequiredRoles('admin', 'manager')
  findAll(@Query() query: QueryParticularClientsDto) {
    return this.particularClientsService.findAll(query);
  }

  @Get(':id')
  @RequiredRoles('admin', 'manager')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.particularClientsService.findOne(id);
  }

  @Post()
  @RequiredRoles('admin', 'manager')
  create(@Body() dto: CreateParticularClientDto) {
    return this.particularClientsService.create(dto);
  }

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParticularClientDto,
  ) {
    return this.particularClientsService.update(id, dto);
  }

  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.particularClientsService.remove(id);
  }
}
