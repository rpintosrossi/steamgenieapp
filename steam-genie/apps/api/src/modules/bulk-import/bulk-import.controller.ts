import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { BuildingScoped } from '../../common/decorators/building-scoped.decorator';
import { BulkImportService } from './bulk-import.service';

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('bulk-import')
@UseGuards(JwtAuthGuard, RolesGuard, BuildingAccessGuard)
export class BulkImportController {
  constructor(private readonly bulkImportService: BulkImportService) {}

  @Get('buildings/:buildingId/template')
  @RequiredRoles('admin', 'manager')
  @BuildingScoped()
  async downloadBuildingTemplate(
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
    @Query('mode') mode: string | undefined,
    @Res() res: Response,
  ) {
    const templateMode = mode === 'empty' ? 'empty' : 'current';
    const buffer = await this.bulkImportService.generateTemplateForBuilding(
      buildingId,
      templateMode,
    );

    const filename =
      templateMode === 'empty'
        ? 'plantilla-vacia.xlsx'
        : 'plantilla-datos-actuales.xlsx';

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Post('buildings/:buildingId/excel')
  @RequiredRoles('admin', 'manager')
  @BuildingScoped()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = file.originalname.toLowerCase();
        const validExt = ext.endsWith('.xlsx') || ext.endsWith('.xls');
        if (ALLOWED_MIME_TYPES.has(file.mimetype) || validExt) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Formato no válido. Subí un archivo Excel (.xlsx).',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadBuildingExcel(
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }

    return this.bulkImportService.processExcelForBuilding(buildingId, file.buffer);
  }
}
