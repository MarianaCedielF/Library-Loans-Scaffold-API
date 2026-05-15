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
import { Loan } from './entities/loan.entity';

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
      where: { userId, status: 'active' },
    });
    if (activeCount >= maxActive) {
      throw new BadRequestException(
        `El usuario ya tiene ${maxActive} préstamos activos (límite máximo)`,
      );
    }

    const item = await this.itemRepository.findOne({ where: { id: dto.itemId } });
    if (!item) throw new NotFoundException(`Ítem con id ${dto.itemId} no encontrado`);
    if (item.availableCopies <= 0) {
      throw new BadRequestException('No hay copias disponibles de este ítem');
    }

    const borrowedAt = new Date();
    const dueDate = new Date(borrowedAt);
    dueDate.setDate(dueDate.getDate() + maxDays);

    item.availableCopies -= 1;
    await this.itemRepository.save(item);

    const loan = this.loanRepository.create({
      userId,
      itemId: dto.itemId,
      borrowedAt,
      dueDate,
      status: 'active',
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
    if (loan.status === 'returned') {
      throw new BadRequestException('Este préstamo ya fue devuelto');
    }

    const returnedAt = new Date();
    const dueDate = new Date(loan.dueDate);
    let fineAmount = 0;

    if (returnedAt > dueDate) {
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysOverdue = Math.ceil((returnedAt.getTime() - dueDate.getTime()) / msPerDay);
      fineAmount = parseFloat((daysOverdue * dailyFine).toFixed(2));
    }

    const item = await this.itemRepository.findOne({ where: { id: loan.itemId } });
    if (item) {
      item.availableCopies += 1;
      await this.itemRepository.save(item);
    }

    loan.returnedAt = returnedAt;
    loan.status = 'returned';
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
