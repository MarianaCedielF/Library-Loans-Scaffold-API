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
  createQueryBuilder: jest.fn(),
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

const futureDueAt = () =>
  new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

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

  describe('create — R1 Validación de fechas', () => {
    const baseDto: CreateLoanDto = {
      userId: 'user-uuid',
      itemId: 'item-uuid',
      dueAt: futureDueAt(),
    };

    it('should throw BadRequestException when dueAt is in the past', async () => {
      const dto = { ...baseDto, dueAt: '2020-01-01T00:00:00.000Z' };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when dueAt - loanedAt > 30 días', async () => {
      const farFuture = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
      const dto = { ...baseDto, dueAt: farFuture };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('create — R3 Límite de préstamos simultáneos', () => {
    const dto: CreateLoanDto = {
      userId: 'user-uuid',
      itemId: 'item-uuid',
      dueAt: futureDueAt(),
    };

    it('should throw ConflictException when user has 3 active/overdue loans', async () => {
      loanRepo.count!.mockResolvedValue(3);
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('create — R2 Ítem disponible', () => {
    const dto: CreateLoanDto = {
      userId: 'user-uuid',
      itemId: 'item-uuid',
      dueAt: futureDueAt(),
    };

    it('should throw NotFoundException when item does not exist', async () => {
      loanRepo.count!.mockResolvedValue(0);
      itemRepo.findOne!.mockResolvedValue(null);
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException with loanId when item has active loan', async () => {
      loanRepo.count!.mockResolvedValue(0);
      itemRepo.findOne!.mockResolvedValue(makeItem());
      loanRepo.findOne!.mockResolvedValue(makeLoan({ id: 'blocking-loan-id' }));

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow('blocking-loan-id');
    });

    it('should create loan when all conditions are met', async () => {
      const loan = makeLoan();
      loanRepo.count!.mockResolvedValue(0);
      itemRepo.findOne!.mockResolvedValue(makeItem());
      loanRepo.findOne!.mockResolvedValue(null);
      loanRepo.create!.mockReturnValue(loan);
      loanRepo.save!.mockResolvedValue(loan);

      const result = await service.create(dto);
      expect(result.status).toBe(LoanStatus.ACTIVE);
    });
  });

  describe('returnLoan — R4 Cálculo de multa', () => {
    afterEach(() => jest.useRealTimers());

    const setupReturn = (returnedAtIso: string, dueAtIso: string) => {
      jest.useFakeTimers().setSystemTime(new Date(returnedAtIso));
      const loan = makeLoan({ dueAt: new Date(dueAtIso) });
      loanRepo.findOne!.mockResolvedValue(loan);
      loanRepo.save!.mockImplementation((l: Loan) => Promise.resolve(l));
    };

    it('fineAmount = 0.00 cuando devuelto en la fecha límite', async () => {
      setupReturn('2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z');
      const result = await service.returnLoan('loan-uuid');
      expect(result.fineAmount).toBe(0);
    });

    it('fineAmount = 0.50 cuando 1 día de retraso', async () => {
      setupReturn('2026-01-11T00:00:00.000Z', '2026-01-10T00:00:00.000Z');
      const result = await service.returnLoan('loan-uuid');
      expect(result.fineAmount).toBe(0.5);
    });

    it('fineAmount = 2.50 cuando 5 días de retraso', async () => {
      setupReturn('2026-01-15T00:00:00.000Z', '2026-01-10T00:00:00.000Z');
      const result = await service.returnLoan('loan-uuid');
      expect(result.fineAmount).toBe(2.5);
    });

    it('fineAmount = 1.50 cuando 2.5 días reales → ceil(2.5) = 3 días', async () => {
      setupReturn('2026-01-12T12:00:00.000Z', '2026-01-10T00:00:00.000Z');
      const result = await service.returnLoan('loan-uuid');
      expect(result.fineAmount).toBe(1.5);
    });

    it('status siempre es returned', async () => {
      loanRepo.findOne!.mockResolvedValue(makeLoan());
      loanRepo.save!.mockImplementation((l: Loan) => Promise.resolve(l));
      const result = await service.returnLoan('loan-uuid');
      expect(result.status).toBe(LoanStatus.RETURNED);
    });

    it('should throw NotFoundException when loan does not exist', async () => {
      loanRepo.findOne!.mockResolvedValue(null);
      await expect(service.returnLoan('no-loan')).rejects.toThrow(NotFoundException);
    });
  });

  describe('R5 — Transiciones terminales', () => {
    it('returnLoan: should throw BadRequestException when already returned', async () => {
      loanRepo.findOne!.mockResolvedValue(makeLoan({ status: LoanStatus.RETURNED }));
      await expect(service.returnLoan('loan-uuid')).rejects.toThrow(BadRequestException);
    });

    it('returnLoan: should throw BadRequestException when already lost', async () => {
      loanRepo.findOne!.mockResolvedValue(makeLoan({ status: LoanStatus.LOST }));
      await expect(service.returnLoan('loan-uuid')).rejects.toThrow(BadRequestException);
    });

    it('markLost: should mark active loan as lost', async () => {
      loanRepo.findOne!.mockResolvedValue(makeLoan());
      loanRepo.save!.mockImplementation((l: Loan) => Promise.resolve(l));

      const result = await service.markLost('loan-uuid');
      expect(result.status).toBe(LoanStatus.LOST);
    });

    it('markLost: should throw BadRequestException when already returned', async () => {
      loanRepo.findOne!.mockResolvedValue(makeLoan({ status: LoanStatus.RETURNED }));
      await expect(service.markLost('loan-uuid')).rejects.toThrow(BadRequestException);
    });

    it('markLost: should throw BadRequestException when already lost', async () => {
      loanRepo.findOne!.mockResolvedValue(makeLoan({ status: LoanStatus.LOST }));
      await expect(service.markLost('loan-uuid')).rejects.toThrow(BadRequestException);
    });
  });
});
