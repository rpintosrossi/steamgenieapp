import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  CreatePaymentMethodDto,
  QueryPaymentMethodsDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto';

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryPaymentMethodsDto) {
    return this.prisma.paymentMethod.findMany({
      where: {
        deletedAt: null,
        ...(query.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { quotePayments: true } } },
    });
  }

  async create(dto: CreatePaymentMethodDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El nombre es obligatorio.');

    return this.prisma.paymentMethod.create({
      data: {
        name,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdatePaymentMethodDto) {
    await this.assertExists(id);
    return this.prisma.paymentMethod.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.assertExists(id);
    return this.prisma.paymentMethod.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  private async assertExists(id: string) {
    const row = await this.prisma.paymentMethod.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Método de pago no encontrado');
    return row;
  }
}
