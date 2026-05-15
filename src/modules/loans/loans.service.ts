import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { ReservationsService } from '../reservations/reservations.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { QueryLoansDto } from './dto/query-loans.dto';
import { Loan, LoanStatus } from './entities/loan.entity';

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan)
    private readonly loanRepository: Repository<Loan>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    private readonly config: ConfigService,
    private readonly reservationsService: ReservationsService,
  ) {}

  async create(dto: CreateLoanDto): Promise<Loan> {
    const maxActive = this.config.get<number>('loans.maxActivePerUser', 3);
    const maxLoanDays = this.config.get<number>('loans.maxLoanDays', 30);

    const loanedAt = new Date();
    const dueAt = new Date(dto.dueAt);

    // R1 — Validación de fechas
    if (dueAt <= loanedAt) {
      throw new BadRequestException('dueAt debe ser posterior a loanedAt (now)');
    }
    const diffDays = (dueAt.getTime() - loanedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > maxLoanDays) {
      throw new BadRequestException(
        `dueAt - loanedAt no puede superar ${maxLoanDays} días`,
      );
    }

    // R3 — Límite de préstamos simultáneos por usuario
    const activeCount = await this.loanRepository.count({
      where: [
        { userId: dto.userId, status: LoanStatus.ACTIVE },
        { userId: dto.userId, status: LoanStatus.OVERDUE },
      ],
    });
    if (activeCount >= maxActive) {
      throw new ConflictException(
        `El usuario ya tiene ${maxActive} préstamos activos/vencidos (límite MAX_ACTIVE_LOANS_PER_USER)`,
      );
    }

    // Verificar que el ítem existe y está activo
    const item = await this.itemRepository.findOne({ where: { id: dto.itemId, isActive: true } });
    if (!item) throw new NotFoundException(`Ítem con id ${dto.itemId} no encontrado`);

    // R2 — Ítem disponible: no debe tener préstamo active u overdue
    const blockingLoan = await this.loanRepository.findOne({
      where: [
        { itemId: dto.itemId, status: LoanStatus.ACTIVE },
        { itemId: dto.itemId, status: LoanStatus.OVERDUE },
      ],
    });
    if (blockingLoan) {
      throw new ConflictException(
        `El ítem no está disponible — bloqueado por préstamo ${blockingLoan.id}`,
      );
    }

    // R-B1.4 — Si hay reservas pendientes, solo el primero en cola puede tomar el préstamo
    await this.reservationsService.assertCanTakeLoan(dto.itemId, dto.userId);

    const loan = this.loanRepository.create({
      userId: dto.userId,
      itemId: dto.itemId,
      loanedAt,
      dueAt,
      status: LoanStatus.ACTIVE,
      fineAmount: 0,
      returnedAt: null,
    });

    return this.loanRepository.save(loan);
  }

  async returnLoan(loanId: string): Promise<Loan> {
    const dailyFine = this.config.get<number>('loans.dailyFineRate', 0.5);

    const loan = await this.loanRepository.findOne({ where: { id: loanId } });
    if (!loan) throw new NotFoundException(`Préstamo con id ${loanId} no encontrado`);

    // R5 — returned y lost son terminales
    if (loan.status === LoanStatus.RETURNED || loan.status === LoanStatus.LOST) {
      throw new BadRequestException(`El préstamo ya tiene estado terminal "${loan.status}"`);
    }

    const returnedAt = new Date();
    const dueAt = new Date(loan.dueAt);

    // R4 — daysOverdue = max(0, ceil((returnedAt - dueAt) / 1 día))
    const daysOverdue = Math.max(
      0,
      Math.ceil((returnedAt.getTime() - dueAt.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const fineAmount = parseFloat((daysOverdue * dailyFine).toFixed(2));

    loan.returnedAt = returnedAt;
    loan.status = LoanStatus.RETURNED;
    loan.fineAmount = fineAmount;

    const saved = await this.loanRepository.save(loan);

    // R-B1.2 — Fulfill next pending reservation for the returned item
    await this.reservationsService.fulfillNextPending(loan.itemId);

    return saved;
  }

  async markLost(loanId: string): Promise<Loan> {
    const loan = await this.loanRepository.findOne({ where: { id: loanId } });
    if (!loan) throw new NotFoundException(`Préstamo con id ${loanId} no encontrado`);

    // R5 — returned y lost son terminales
    if (loan.status === LoanStatus.RETURNED || loan.status === LoanStatus.LOST) {
      throw new BadRequestException(`El préstamo ya tiene estado terminal "${loan.status}"`);
    }

    loan.status = LoanStatus.LOST;
    return this.loanRepository.save(loan);
  }

  async findAll(query: QueryLoansDto): Promise<Loan[]> {
    const qb = this.loanRepository
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.item', 'item')
      .leftJoinAndSelect('loan.user', 'user');

    if (query.userId) {
      qb.andWhere('loan.user_id = :userId', { userId: query.userId });
    }
    if (query.itemId) {
      qb.andWhere('loan.item_id = :itemId', { itemId: query.itemId });
    }

    // R5 — overdue es dinámico: dueAt < now() AND status='active' AND returnedAt IS NULL
    if (query.status === LoanStatus.OVERDUE) {
      qb.andWhere('loan.due_at < NOW()')
        .andWhere('loan.status = :active', { active: LoanStatus.ACTIVE })
        .andWhere('loan.returned_at IS NULL');
    } else if (query.status) {
      qb.andWhere('loan.status = :status', { status: query.status });
    }

    return qb.orderBy('loan.created_at', 'DESC').getMany();
  }

  async findOne(id: string): Promise<Loan> {
    const loan = await this.loanRepository.findOne({
      where: { id },
      relations: ['item', 'user'],
    });
    if (!loan) throw new NotFoundException(`Préstamo con id ${id} no encontrado`);
    return loan;
  }
}
