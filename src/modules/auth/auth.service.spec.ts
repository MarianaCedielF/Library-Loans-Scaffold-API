import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { ObjectLiteral, Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';

type MockRepository<T extends ObjectLiteral> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const mockUserRepository = (): MockRepository<User> => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: MockRepository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepository },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, def?: unknown) => {
              const values: Record<string, unknown> = {
                'bcrypt.saltRounds': 4,
                'jwt.accessSecret': 'access-secret-32-chars-long-enough',
                'jwt.accessExpiresIn': '15m',
                'jwt.refreshSecret': 'refresh-secret-32-chars-long-enough',
                'jwt.refreshExpiresIn': '7d',
              };
              return values[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepo = module.get(getRepositoryToken(User));
  });

  describe('register', () => {
    it('should create a user and return data without password', async () => {
      const dto = { email: 'new@test.com', password: 'password123' };
      const saved: Partial<User> = {
        id: 'uuid-1',
        email: dto.email,
        password: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      userRepo.findOne!.mockResolvedValue(null);
      userRepo.create!.mockReturnValue(saved as User);
      userRepo.save!.mockResolvedValue(saved as User);

      const result = await service.register(dto);

      expect(result).toHaveProperty('id', 'uuid-1');
      expect(result).toHaveProperty('email', dto.email);
      expect(result).not.toHaveProperty('password');
    });

    it('should throw ConflictException when email is already registered', async () => {
      userRepo.findOne!.mockResolvedValue({ id: 'existing' } as User);

      await expect(
        service.register({ email: 'taken@test.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      const password = 'validPass1';
      const hashed = await bcrypt.hash(password, 4);
      const user: Partial<User> = { id: 'uuid-2', email: 'user@test.com', password: hashed };

      userRepo.findOne!.mockResolvedValue(user as User);

      const result = await service.login({ email: 'user@test.com', password });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toMatchObject({ id: 'uuid-2', email: 'user@test.com' });
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      userRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@test.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const hashed = await bcrypt.hash('correctPass', 4);
      userRepo.findOne!.mockResolvedValue({ id: 'x', email: 'u@u.com', password: hashed } as User);

      await expect(
        service.login({ email: 'u@u.com', password: 'wrongPass' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
