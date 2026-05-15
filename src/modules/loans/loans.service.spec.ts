import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { CreateLoanDto } from './dto/create-loan.dto';
import { Loan } from './entities/loan.entity';
import { LoansService } from './loans.service';

type MockRepository<T extends ObjectLiteral> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const mockRepo = <T extends ObjectLiteral>(): MockRepository<T> => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  count: jest.fn(),
});

const makeItem = (overrides: Partial<Item> = {}): Item =>
  ({
    id: 'item-uuid',
    title: 'Clean Code',
    author: 'R. Martin',
    isbn: null,
    description: null,
    totalCopies: 5,
    availableCopies: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Item;

const makeLoan = (overrides: Partial<Loan> = {}): Loan => {
  const borrowedAt = new Date();
  const dueDate = new Date(borrowedAt);
  dueDate.setDate(dueDate.getDate() + 30);
  return {
    id: 'loan-uuid',
    userId: 'user-uuid',
    itemId: 'item-uuid',
    borrowedAt,
    dueDate,
    returnedAt: null,
    fineAmount: 0,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {} as never,
    item: {} as never,
    ...overrides,
  } as Loan;
};

describe('LoansService', () => {
  let service: LoansService;
  let loanRepo: MockRepository<Loan>;
  let itemRepo: MockRepository<Item>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: getRepositoryToken(Loan), useFactory: () => mockRepo<Loan>() },
        { provide: getRepositoryToken(Item), useFactory: () => mockRepo<Item>() },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, def?: unknown) => {
              const values: Record<string, unknown> = {
                'loans.maxActivePerUser': 3,
                'loans.maxLoanDays': 30,
                'loans.dailyFineRate': 0.5,
              };
              return values[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LoansService>(LoansService);
    loanRepo = module.get(getRepositoryToken(Loan));
    itemRepo = module.get(getRepositoryToken(Item));
  });

  describe('create', () => {
    const dto: CreateLoanDto = { itemId: 'item-uuid' };
    const userId = 'user-uuid';

    it('should create a loan when conditions are met', async () => {
      const item = makeItem();
      const loan = makeLoan();

      loanRepo.count!.mockResolvedValue(0);
      itemRepo.findOne!.mockResolvedValue(item);
      itemRepo.save!.mockResolvedValue({ ...item, availableCopies: 4 });
      loanRepo.create!.mockReturnValue(loan);
      loanRepo.save!.mockResolvedValue(loan);

      const result = await service.create(userId, dto);
      expect(result).toEqual(loan);
      expect(itemRepo.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException when max active loans reached', async () => {
      loanRepo.count!.mockResolvedValue(3);

      await expect(service.create(userId, dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when item does not exist', async () => {
      loanRepo.count!.mockResolvedValue(0);
      itemRepo.findOne!.mockResolvedValue(null);

      await expect(service.create(userId, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when no available copies', async () => {
      loanRepo.count!.mockResolvedValue(0);
      itemRepo.findOne!.mockResolvedValue(makeItem({ availableCopies: 0 }));

      await expect(service.create(userId, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('returnLoan', () => {
    it('should return a loan on time with zero fine', async () => {
      const loan = makeLoan();
      const item = makeItem();

      loanRepo.findOne!.mockResolvedValue(loan);
      itemRepo.findOne!.mockResolvedValue(item);
      itemRepo.save!.mockResolvedValue({ ...item, availableCopies: 6 });
      loanRepo.save!.mockResolvedValue({ ...loan, status: 'returned', fineAmount: 0 });

      const result = await service.returnLoan('loan-uuid', 'user-uuid');
      expect(result.status).toBe('returned');
      expect(result.fineAmount).toBe(0);
    });

    it('should calculate fine for overdue return', async () => {
      const borrowedAt = new Date('2025-01-01');
      const dueDate = new Date('2025-01-31');
      const loan = makeLoan({ borrowedAt, dueDate });
      const item = makeItem();

      loanRepo.findOne!.mockResolvedValue(loan);
      itemRepo.findOne!.mockResolvedValue(item);
      itemRepo.save!.mockResolvedValue(item);
      loanRepo.save!.mockImplementation((l: Loan) => Promise.resolve(l));

      const result = await service.returnLoan('loan-uuid', 'user-uuid');
      expect(result.fineAmount).toBeGreaterThan(0);
    });

    it('should throw NotFoundException when loan does not exist', async () => {
      loanRepo.findOne!.mockResolvedValue(null);
      await expect(service.returnLoan('no-loan', 'user-uuid')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when loan belongs to another user', async () => {
      loanRepo.findOne!.mockResolvedValue(makeLoan({ userId: 'other-user' }));
      await expect(service.returnLoan('loan-uuid', 'user-uuid')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when loan is already returned', async () => {
      loanRepo.findOne!.mockResolvedValue(makeLoan({ status: 'returned' }));
      await expect(service.returnLoan('loan-uuid', 'user-uuid')).rejects.toThrow(BadRequestException);
    });
  });
});
