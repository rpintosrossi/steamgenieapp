import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { QueryReservationsDto } from './dto/query-reservations.dto';
import type { AuthUser } from '@steam-genie/shared-types';

@Controller('reservations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  @RequiredRoles('admin', 'manager')
  findAll(@Query() query: QueryReservationsDto) {
    return this.reservationsService.findAll(query);
  }

  @Post()
  @RequiredRoles('admin', 'manager')
  create(
    @Body() dto: CreateReservationDto,
    @Request() req: { user: AuthUser },
  ) {
    return this.reservationsService.create(dto, req.user.id);
  }

  @Get(':id')
  @RequiredRoles('admin', 'manager')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.findOne(id);
  }

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReservationDto,
  ) {
    return this.reservationsService.update(id, dto);
  }

  @Get(':id/work-orders')
  @RequiredRoles('admin', 'manager')
  findWorkOrders(@Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.findWorkOrders(id);
  }
}
