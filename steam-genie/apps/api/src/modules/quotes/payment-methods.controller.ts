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
import { PaymentMethodsService } from './payment-methods.service';
import {
  CreatePaymentMethodDto,
  QueryPaymentMethodsDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto';

@Controller('payment-methods')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Get()
  @RequiredRoles('admin', 'manager')
  findAll(@Query() query: QueryPaymentMethodsDto) {
    return this.paymentMethodsService.findAll(query);
  }

  @Post()
  @RequiredRoles('admin', 'manager')
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.create(dto);
  }

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ) {
    return this.paymentMethodsService.update(id, dto);
  }

  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentMethodsService.remove(id);
  }
}
