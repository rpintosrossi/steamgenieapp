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
import { QuoteBranchesService } from './quote-branches.service';
import {
  CreateQuoteBranchDto,
  QueryQuoteBranchesDto,
  UpdateQuoteBranchDto,
} from './dto/quote-branch.dto';

@Controller('quote-branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuoteBranchesController {
  constructor(private readonly quoteBranchesService: QuoteBranchesService) {}

  @Get()
  @RequiredRoles('admin', 'manager')
  findAll(@Query() query: QueryQuoteBranchesDto) {
    return this.quoteBranchesService.findAll(query);
  }

  @Post()
  @RequiredRoles('admin', 'manager')
  create(@Body() dto: CreateQuoteBranchDto) {
    return this.quoteBranchesService.create(dto);
  }

  @Patch(':id')
  @RequiredRoles('admin', 'manager')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteBranchDto,
  ) {
    return this.quoteBranchesService.update(id, dto);
  }

  @Delete(':id')
  @RequiredRoles('admin', 'manager')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteBranchesService.remove(id);
  }
}
