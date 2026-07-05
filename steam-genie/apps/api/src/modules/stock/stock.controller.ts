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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '@steam-genie/shared-types';
import { StockService } from './stock.service';
import { QueryStockProductsDto } from './dto/query-stock-products.dto';
import { QueryStockCatalogDto } from './dto/query-stock-catalog.dto';
import { CreateStockCategoryDto } from './dto/create-stock-category.dto';
import { UpdateStockCategoryDto } from './dto/update-stock-category.dto';
import { CreateStockSupplierDto } from './dto/create-stock-supplier.dto';
import { UpdateStockSupplierDto } from './dto/update-stock-supplier.dto';
import { CreateStockProductDto } from './dto/create-stock-product.dto';
import { UpdateStockProductDto } from './dto/update-stock-product.dto';
import { AdjustStockProductDto } from './dto/adjust-stock-product.dto';
import { BulkAdjustStockDto } from './dto/bulk-adjust-stock.dto';

const STOCK_ROLES = ['admin', 'manager', 'stock'] as const;

@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('stats')
  @RequiredRoles(...STOCK_ROLES)
  getStats() {
    return this.stockService.getStats();
  }

  @Get('products/grouped')
  @RequiredRoles(...STOCK_ROLES)
  findProductsGrouped(@Query() query: QueryStockProductsDto) {
    return this.stockService.findProductsGrouped(query);
  }

  @Post('products')
  @RequiredRoles(...STOCK_ROLES)
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateStockProductDto) {
    return this.stockService.createProduct(dto, user.id);
  }

  @Patch('products/:id')
  @RequiredRoles(...STOCK_ROLES)
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateStockProductDto,
  ) {
    return this.stockService.updateProduct(id, dto, user.id);
  }

  @Patch('products/:id/adjust')
  @RequiredRoles(...STOCK_ROLES)
  adjustProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AdjustStockProductDto,
  ) {
    return this.stockService.adjustProduct(id, dto, user.id);
  }

  @Post('products/bulk-adjust')
  @RequiredRoles(...STOCK_ROLES)
  bulkAdjust(@CurrentUser() user: AuthUser, @Body() dto: BulkAdjustStockDto) {
    return this.stockService.bulkAdjust(dto, user.id);
  }

  @Get('products/:id/movements')
  @RequiredRoles(...STOCK_ROLES)
  listProductMovements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
  ) {
    return this.stockService.listProductMovements(id, limit ? Number(limit) : undefined);
  }

  @Delete('products/:id')
  @RequiredRoles(...STOCK_ROLES)
  removeProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockService.removeProduct(id);
  }

  @Get('categories')
  @RequiredRoles(...STOCK_ROLES)
  findAllCategories(@Query() query: QueryStockCatalogDto) {
    return this.stockService.findAllCategories(query.includeInactive);
  }

  @Post('categories')
  @RequiredRoles(...STOCK_ROLES)
  createCategory(@Body() dto: CreateStockCategoryDto) {
    return this.stockService.createCategory(dto);
  }

  @Patch('categories/:id')
  @RequiredRoles(...STOCK_ROLES)
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockCategoryDto,
  ) {
    return this.stockService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @RequiredRoles(...STOCK_ROLES)
  removeCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockService.removeCategory(id);
  }

  @Get('suppliers')
  @RequiredRoles(...STOCK_ROLES)
  findAllSuppliers(@Query() query: QueryStockCatalogDto) {
    return this.stockService.findAllSuppliers(query.includeInactive);
  }

  @Post('suppliers')
  @RequiredRoles(...STOCK_ROLES)
  createSupplier(@Body() dto: CreateStockSupplierDto) {
    return this.stockService.createSupplier(dto);
  }

  @Patch('suppliers/:id')
  @RequiredRoles(...STOCK_ROLES)
  updateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockSupplierDto,
  ) {
    return this.stockService.updateSupplier(id, dto);
  }

  @Delete('suppliers/:id')
  @RequiredRoles(...STOCK_ROLES)
  removeSupplier(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockService.removeSupplier(id);
  }
}
