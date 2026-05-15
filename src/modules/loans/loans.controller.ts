import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';
import { CreateLoanDto } from './dto/create-loan.dto';
import { LoansService } from './loans.service';

@ApiTags('loans')
@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un préstamo para el usuario autenticado' })
  create(@CurrentUser() user: User, @Body() dto: CreateLoanDto) {
    return this.loansService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los préstamos (admin)' })
  findAll() {
    return this.loansService.findAll();
  }

  @Get('me')
  @ApiOperation({ summary: 'Listar préstamos del usuario autenticado' })
  findMine(@CurrentUser() user: User) {
    return this.loansService.findAllByUser(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un préstamo por id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.findOne(id);
  }

  @Patch(':id/return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Devolver un préstamo activo' })
  returnLoan(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.loansService.returnLoan(id, user.id);
  }
}
