import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../auth/entities/user.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { QueryReservationsDto } from './dto/query-reservations.dto';
import { ReservationsService } from './reservations.service';

@ApiTags('reservations')
@ApiBearerAuth()
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear reserva para un ítem no disponible' })
  create(@Body() dto: CreateReservationDto, @CurrentUser() user: User) {
    return this.reservationsService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar reservas. Admin/librarian ven todas; member ve las suyas' })
  findAll(@Query() query: QueryReservationsDto, @CurrentUser() user: User) {
    const isAdminOrLibrarian = user.role === UserRole.ADMIN || user.role === UserRole.LIBRARIAN;
    return this.reservationsService.findAll(query, user.id, isAdminOrLibrarian);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar reserva propia (admin/librarian pueden cancelar cualquiera)' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    const isAdminOrLibrarian = user.role === UserRole.ADMIN || user.role === UserRole.LIBRARIAN;
    return this.reservationsService.cancel(id, user.id, isAdminOrLibrarian);
  }
}
