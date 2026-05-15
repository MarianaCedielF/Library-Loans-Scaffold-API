import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { Item, ItemType } from '../items/entities/item.entity';
import { CreateLoanDto } from './dto/create-loan.dto';
import { Loan, LoanStatus } from './entities/loan.entity';
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
    code: 'BK-0042',
    title: 'Clean Code',
    type: ItemType.BOOK,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Item;

const makeLoan = (overrides: Partial<Loan> = {}): Loan => {
  const loanedAt = new Date();
  const dueAt = new Date(loanedAt);
  dueAt.setDate(dueAt.getDate() + 30);
  return {
    id: 'loan-uuid',
    userId: 'user-uuid',
    itemId: 'item-uuid',
    loanedAt,
    dueAt,
    returnedAt: null,
    fineAmount: 0,
    status: LoanStatus.ACTIVE,
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
    const dto: CreateLoanDto = {
      userId: 'user-uuid',
      itemId: 'item-uuid',
      dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    it('should create a loan when all conditions are met', async () => {
      const loan = makeLoan();
      loanRepo.count!.mockResolvedValue(0);
      itemRepo.findOne!.mockResolvedValue(makeItem());
      loanRepo.findOne!.mockResolvedValue(null);
      loanRepo.create!.mockReturnValue(loan);
      loanRepo.save!.mockResolvedValue(loan);

      const result = await service.create(dto);
      expect(result.status).toBe(LoanStatus.ACTIVE);
    });

    it('should throw BadRequestException when dueAt is in the past', async () => {
      const pastDto = { ...dto, dueAt: '2020-01-01T00:00:00.000Z' };
      await expect(service.create(pastDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when max active loans reached', async () => {
      loanRepo.count!.mockResolvedValue(3);
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when item does not exist or is inactive', async () => {
      loanRepo.count!.mockResolvedValue(0);
      itemRepo.findOne!.mockResolvedValue(null);
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when item already has an active loan', async () => {
      loanRepo.count!.mockResolvedValue(0);
      itemRepo.findOne!.mockResolvedValue(makeItem());
      loanRepo.findOne!.mockResolvedValue(makeLoan());
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('returnLoan', () => {
    it('should return a loan on time with zero fine', async () => {
      loanRepo.findOne!.mockResolvedValue(makeLoan());
      loanRepo.save!.mockImplementation((l: Loan) => Promise.resolve(l));

      const result = await service.returnLoan('loan-uuid');
      expect(result.status).toBe(LoanStatus.RETURNED);
      expect(result.fineAmount).toBe(0);
    });

    it('should calculate fine for an overdue return', async () => {
      const loanedAt = new Date('2025-01-01');
      const dueAt = new Date('2025-01-31');
      loanRepo.findOne!.mockResolvedValue(makeLoan({ loanedAt, dueAt }));
      loanRepo.save!.mockImplementation((l: Loan) => Promise.resolve(l));

      const result = await service.returnLoan('loan-uuid');
      expect(result.fineAmount).toBeGreaterThan(0);
    });

    it('should throw NotFoundException when loan does not exist', async () => {
      loanRepo.findOne!.mockResolvedValue(null);
      await expect(service.returnLoan('no-loan')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when loan is already returned', async () => {
      loanRepo.findOne!.mockResolvedValue(makeLoan({ status: LoanStatus.RETURNED }));
      await expect(service.returnLoan('loan-uuid')).rejects.toThrow(ConflictException);
    });
  });

  describe('markLost', () => {
    it('should mark loan as lost', async () => {
      loanRepo.findOne!.mockResolvedValue(makeLoan());
      loanRepo.save!.mockImplementation((l: Loan) => Promise.resolve(l));

      const result = await service.markLost('loan-uuid');
      expect(result.status).toBe(LoanStatus.LOST);
    });

    it('should throw NotFoundException when loan does not exist', async () => {
      loanRepo.findOne!.mockResolvedValue(null);
      await expect(service.markLost('no-loan')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when loan is already returned', async () => {
      loanRepo.findOne!.mockResolvedValue(makeLoan({ status: LoanStatus.RETURNED }));
      await expect(service.markLost('loan-uuid')).rejects.toThrow(ConflictException);
    });
  });
});
