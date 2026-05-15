import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { CreateLoanDto } from './dto/create-loan.dto';
import { Loan, LoanStatus } from './entities/loan.entity';

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan)
    private readonly loanRepository: Repository<Loan>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string, dto: CreateLoanDto): Promise<Loan> {
    const maxActive = this.config.get<number>('loans.maxActivePerUser', 3);
    const maxDays = this.config.get<number>('loans.maxLoanDays', 30);

    const activeCount = await this.loanRepository.count({
      where: { userId, status: LoanStatus.ACTIVE },
    });
    if (activeCount >= maxActive) {
      throw new BadRequestException(
        `El usuario ya tiene ${maxActive} préstamos activos (límite máximo)`,
      );
    }

    const item = await this.itemRepository.findOne({ where: { id: dto.itemId, isActive: true } });
    if (!item) throw new NotFoundException(`Ítem con id ${dto.itemId} no encontrado`);

    const activeLoan = await this.loanRepository.findOne({
      where: { itemId: dto.itemId, status: LoanStatus.ACTIVE },
    });
    if (activeLoan) throw new BadRequestException('El ítem no está disponible actualmente');

    const loanedAt = new Date();
    const dueAt = new Date(loanedAt);
    dueAt.setDate(dueAt.getDate() + maxDays);

    const loan = this.loanRepository.create({
      userId,
      itemId: dto.itemId,
      loanedAt,
      dueAt,
      status: LoanStatus.ACTIVE,
      fineAmount: 0,
      returnedAt: null,
    });

    return this.loanRepository.save(loan);
  }

  async returnLoan(loanId: string, userId: string): Promise<Loan> {
    const dailyFine = this.config.get<number>('loans.dailyFineRate', 0.5);

    const loan = await this.loanRepository.findOne({ where: { id: loanId } });
    if (!loan) throw new NotFoundException(`Préstamo con id ${loanId} no encontrado`);
    if (loan.userId !== userId) throw new ForbiddenException('No tienes permiso sobre este préstamo');
    if (loan.status === LoanStatus.RETURNED || loan.status === LoanStatus.LOST) {
      throw new BadRequestException(`El préstamo ya tiene estado "${loan.status}"`);
    }

    const returnedAt = new Date();
    const dueAt = new Date(loan.dueAt);
    let fineAmount = 0;

    if (returnedAt > dueAt) {
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysOverdue = Math.ceil((returnedAt.getTime() - dueAt.getTime()) / msPerDay);
      fineAmount = parseFloat((daysOverdue * dailyFine).toFixed(2));
    }

    loan.returnedAt = returnedAt;
    loan.status = LoanStatus.RETURNED;
    loan.fineAmount = fineAmount;

    return this.loanRepository.save(loan);
  }

  findAllByUser(userId: string): Promise<Loan[]> {
    return this.loanRepository.find({
      where: { userId },
      relations: ['item'],
      order: { createdAt: 'DESC' },
    });
  }

  findAll(): Promise<Loan[]> {
    return this.loanRepository.find({
      relations: ['item', 'user'],
      order: { createdAt: 'DESC' },
    });
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
