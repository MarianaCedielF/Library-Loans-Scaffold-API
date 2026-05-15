import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateItemDto } from './dto/create-item.dto';
import { QueryItemsDto } from './dto/query-items.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemsService } from './items.service';

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un ítem' })
  create(@Body() dto: CreateItemDto) {
    return this.itemsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar ítems activos. Filtro opcional ?type=' })
  findAll(@Query() query: QueryItemsDto) {
    return this.itemsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un ítem, incluido isAvailable' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.itemsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar title o type de un ítem' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateItemDto) {
    return this.itemsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete (isActive = false)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.itemsService.remove(id);
  }
}
