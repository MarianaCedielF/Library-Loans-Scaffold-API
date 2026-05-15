import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { LoanStatus } from '../loans/entities/loan.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { QueryReservationsDto } from './dto/query-reservations.dto';
import { Reservation } from './entities/reservation.entity';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateReservationDto, userId: string): Promise<Reservation> {
    // Verify item exists and is active
    const item = await this.dataSource
      .getRepository('items')
      .createQueryBuilder('item')
      .where('item.id = :id AND item.is_active = true', { id: dto.itemId })
      .getOne();
    if (!item) throw new NotFoundException(`Ítem con id ${dto.itemId} no encontrado`);

    // R-B1: Only reserve if item is NOT available (has active loan)
    const activeLoanCount = await this.dataSource
      .getRepository('loans')
      .createQueryBuilder('loan')
      .where('loan.item_id = :itemId AND loan.status IN (:...statuses)', {
        itemId: dto.itemId,
        statuses: [LoanStatus.ACTIVE, LoanStatus.OVERDUE],
      })
      .getCount();
    if (activeLoanCount === 0) {
      throw new ConflictException('No se puede reservar un ítem disponible');
    }

    // R-B1.1: User can't have more than 1 pending reservation for the same item
    const existingPending = await this.reservationRepository.findOne({
      where: {
        userId,
        itemId: dto.itemId,
        fulfilledAt: IsNull(),
        cancelledAt: IsNull(),
      },
    });
    if (existingPending) {
      throw new ConflictException('Ya tienes una reserva pendiente para este ítem');
    }

    const reservation = this.reservationRepository.create({
      userId,
      itemId: dto.itemId,
      fulfilledAt: null,
      cancelledAt: null,
      expiresAt: null,
    });
    return this.reservationRepository.save(reservation);
  }

  async findAll(query: QueryReservationsDto, requestingUserId: string, isAdminOrLibrarian: boolean): Promise<Reservation[]> {
    const qb = this.reservationRepository
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.item', 'item')
      .leftJoinAndSelect('reservation.user', 'user');

    if (isAdminOrLibrarian) {
      if (query.userId) qb.andWhere('reservation.user_id = :userId', { userId: query.userId });
      if (query.itemId) qb.andWhere('reservation.item_id = :itemId', { itemId: query.itemId });
    } else {
      qb.andWhere('reservation.user_id = :userId', { userId: requestingUserId });
      if (query.itemId) qb.andWhere('reservation.item_id = :itemId', { itemId: query.itemId });
    }

    return qb.orderBy('reservation.created_at', 'DESC').getMany();
  }

  async cancel(reservationId: string, requestingUserId: string, isAdminOrLibrarian: boolean): Promise<Reservation> {
    const reservation = await this.reservationRepository.findOne({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException(`Reserva con id ${reservationId} no encontrada`);

    if (!isAdminOrLibrarian && reservation.userId !== requestingUserId) {
      throw new ForbiddenException('Solo puedes cancelar tus propias reservas');
    }

    if (reservation.cancelledAt) {
      throw new ConflictException('La reserva ya está cancelada');
    }

    reservation.cancelledAt = new Date();
    return this.reservationRepository.save(reservation);
  }

  // Called from LoansService on loan return (R-B1.2)
  async fulfillNextPending(itemId: string): Promise<void> {
    const next = await this.reservationRepository.findOne({
      where: {
        itemId,
        fulfilledAt: IsNull(),
        cancelledAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
    });

    if (!next) return;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    next.fulfilledAt = now;
    next.expiresAt = expiresAt;
    await this.reservationRepository.save(next);
  }

  // Called from LoansService on loan creation (R-B1.4)
  async assertCanTakeLoan(itemId: string, userId: string): Promise<void> {
    // Find first active reservation in queue (pending or fulfilled+not expired)
    const now = new Date();

    // Check pending reservations
    const firstPending = await this.reservationRepository.findOne({
      where: {
        itemId,
        fulfilledAt: IsNull(),
        cancelledAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
    });

    // Check fulfilled but not expired reservations
    const fulfilledNotExpired = await this.reservationRepository
      .createQueryBuilder('r')
      .where('r.item_id = :itemId', { itemId })
      .andWhere('r.fulfilled_at IS NOT NULL')
      .andWhere('r.expires_at > :now', { now })
      .andWhere('r.cancelled_at IS NULL')
      .orderBy('r.created_at', 'ASC')
      .getOne();

    // Determine head of queue: fulfilled+not-expired takes priority
    const head = fulfilledNotExpired ?? firstPending;

    if (!head) return; // No reservations → anyone can take it

    if (head.userId !== userId) {
      throw new ForbiddenException(
        `El ítem tiene reservas pendientes. Solo el usuario con la reserva ${head.id} puede tomar el préstamo`,
      );
    }

    // User is head of queue — consuming the reservation (mark as cancelled to clean queue)
    head.cancelledAt = new Date();
    await this.reservationRepository.save(head);
  }
}
