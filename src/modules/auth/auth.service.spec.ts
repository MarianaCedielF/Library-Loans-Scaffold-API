import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { ObjectLiteral, Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { User, UserRole } from './entities/user.entity';

type MockRepository<T extends ObjectLiteral> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const mockUserRepository = (): MockRepository<User> => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

const mockRefreshTokenRepository = (): MockRepository<RefreshToken> => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

const baseUser = (): Partial<User> => ({
  id: 'uuid-1',
  email: 'test@test.com',
  passwordHash: 'hashed',
  firstName: 'Juan',
  lastName: 'Pérez',
  role: UserRole.MEMBER,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: MockRepository<User>;
  let refreshTokenRepo: MockRepository<RefreshToken>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepository },
        { provide: getRepositoryToken(RefreshToken), useFactory: mockRefreshTokenRepository },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-token'), verify: jest.fn() },
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
    refreshTokenRepo = module.get(getRepositoryToken(RefreshToken));
    refreshTokenRepo.create!.mockReturnValue({} as RefreshToken);
    refreshTokenRepo.save!.mockResolvedValue({} as RefreshToken);
  });

  describe('register', () => {
    it('should create a user and return data without passwordHash', async () => {
      const dto = {
        email: 'new@test.com',
        password: 'password123',
        firstName: 'Juan',
        lastName: 'Pérez',
      };
      const saved = { ...baseUser(), email: dto.email };

      userRepo.findOne!.mockResolvedValue(null);
      userRepo.create!.mockReturnValue(saved as User);
      userRepo.save!.mockResolvedValue(saved as User);

      const result = await service.register(dto);

      expect(result).toHaveProperty('accessToken');
      expect(result.user).toHaveProperty('email', dto.email);
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should throw ConflictException when email is already registered', async () => {
      userRepo.findOne!.mockResolvedValue(baseUser() as User);

      await expect(
        service.register({
          email: 'taken@test.com',
          password: 'password123',
          firstName: 'A',
          lastName: 'B',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      const password = 'validPass1';
      const passwordHash = await bcrypt.hash(password, 4);
      userRepo.findOne!.mockResolvedValue({ ...baseUser(), passwordHash } as User);

      const result = await service.login({ email: 'test@test.com', password });

      expect(result).toHaveProperty('accessToken');
      expect(result.user).toMatchObject({ email: 'test@test.com' });
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      userRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@test.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const passwordHash = await bcrypt.hash('correctPass', 4);
      userRepo.findOne!.mockResolvedValue({ ...baseUser(), passwordHash } as User);

      await expect(
        service.login({ email: 'test@test.com', password: 'wrongPass' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
