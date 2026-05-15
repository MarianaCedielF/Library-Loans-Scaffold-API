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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateLoanDto } from './dto/create-loan.dto';
import { QueryLoansDto } from './dto/query-loans.dto';
import { LoansService } from './loans.service';

@ApiTags('loans')
@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear préstamo. loanedAt = now(), dueAt provisto por cliente' })
  create(@Body() dto: CreateLoanDto) {
    return this.loansService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar préstamos. Filtros: ?userId=&itemId=&status=' })
  findAll(@Query() query: QueryLoansDto) {
    return this.loansService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un préstamo' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.findOne(id);
  }

  @Patch(':id/return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar como devuelto. Calcula multa automáticamente' })
  returnLoan(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.returnLoan(id);
  }

  @Patch(':id/mark-lost')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar préstamo como lost' })
  markLost(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.markLost(id);
  }
}
