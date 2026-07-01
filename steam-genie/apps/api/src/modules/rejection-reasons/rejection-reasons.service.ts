import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RejectionReasonType } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateRejectionReasonDto } from './dto/create-rejection-reason.dto';
import { UpdateRejectionReasonDto } from './dto/update-rejection-reason.dto';
import { QueryRejectionReasonsDto } from './dto/query-rejection-reasons.dto';

const REASON_SELECT = {
  id: true,
  type: true,
  text: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class RejectionReasonsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryRejectionReasonsDto) {
    const { type, includeInactive } = query;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { deletedAt: null };
    if (type) where.type = type;
    if (!includeInactive) where.isActive = true;

    return this.prisma.rejectionReason.findMany({
      where,
      select: REASON_SELECT,
      orderBy: [{ isActive: 'desc' }, { text: 'asc' }],
    });
  }

  async create(dto: CreateRejectionReasonDto) {
    const normalized = dto.text.trim();
    await this.assertTextAvailable(dto.type, normalized);

    return this.prisma.rejectionReason.create({
      data: {
        type: dto.type,
        text: normalized,
        isActive: true,
      },
      select: REASON_SELECT,
    });
  }

  async update(id: string, dto: UpdateRejectionReasonDto) {
    const existing = await this.assertExists(id);

    if (dto.text !== undefined) {
      const normalized = dto.text.trim();
      if (normalized !== existing.text) {
        await this.assertTextAvailable(existing.type, normalized, id);
      }
    }

    return this.prisma.rejectionReason.update({
      where: { id },
      data: {
        ...(dto.text !== undefined ? { text: dto.text.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: REASON_SELECT,
    });
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.rejectionReason.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Rejection reason deleted' };
  }

  private async assertExists(id: string) {
    const reason = await this.prisma.rejectionReason.findFirst({
      where: { id, deletedAt: null },
    });
    if (!reason) throw new NotFoundException('Rejection reason not found');
    return reason;
  }

  private async assertTextAvailable(
    type: RejectionReasonType,
    text: string,
    excludeId?: string,
  ) {
    const duplicate = await this.prisma.rejectionReason.findFirst({
      where: {
        type,
        text: { equals: text, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException('Ya existe un motivo con ese texto para este tipo.');
    }
  }
}
