import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '@steam-genie/shared-types';
import { QuotesService } from './quotes.service';
import { QueryQuotesDto, QueryPaymentsDashboardDto } from './dto/query-quotes.dto';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { ConvertQuoteDto } from './dto/convert-quote.dto';

const ALLOWED_INTERNAL_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

@Controller('quotes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get()
  @RequiredRoles('admin', 'manager')
  findAll(@Query() query: QueryQuotesDto, @CurrentUser() user: AuthUser) {
    return this.quotesService.findAll(query, user);
  }

  @Get('payments-dashboard')
  @RequiredRoles('admin', 'manager')
  paymentsDashboard(
    @Query() query: QueryPaymentsDashboardDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotesService.getPaymentsDashboard(query, user);
  }

  @Get(':id')
  @RequiredRoles('admin', 'manager')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.quotesService.findOne(id, user);
  }

  @Get(':id/particular-client-matches')
  @RequiredRoles('admin', 'manager')
  particularClientMatches(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.findParticularClientMatches(id);
  }

  @Get(':id/pdf')
  @RequiredRoles('admin', 'manager')
  async pdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { buffer, filename } = await this.quotesService.generatePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(buffer);
  }

  @Get(':id/internal-photos')
  @RequiredRoles('admin', 'manager')
  listInternalPhotos(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.listInternalPhotos(id);
  }

  @Get(':id/internal-photos/:photoId/file')
  @RequiredRoles('admin', 'manager')
  serveInternalPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Res() res: Response,
  ) {
    return this.quotesService.serveInternalPhoto(id, photoId, res);
  }

  @Post(':id/internal-photos')
  @RequiredRoles('admin', 'manager')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_INTERNAL_PHOTO_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Tipo de archivo no permitido "${file.mimetype}". Usá JPEG, PNG, WebP o HEIC.`,
            ),
            false,
          );
        }
      },
    }),
  )
  uploadInternalPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotesService.uploadInternalPhoto(id, file, user.id);
  }

  @Delete(':id/internal-photos/:photoId')
  @RequiredRoles('admin', 'manager')
  deleteInternalPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotesService.deleteInternalPhoto(id, photoId, user.id);
  }

  @Post()
  @RequiredRoles('admin', 'manager')
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: AuthUser) {
    return this.quotesService.create(dto, user.id);
  }

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuoteDto) {
    return this.quotesService.update(id, dto);
  }

  @Post(':id/convert-to-work-order')
  @RequiredRoles('admin', 'manager')
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertQuoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotesService.convertToWorkOrder(id, dto, user.id);
  }

  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.remove(id);
  }
}
