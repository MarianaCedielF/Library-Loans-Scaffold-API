import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { User, UserRole } from './entities/user.entity';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('El email ya está registrado');

    const saltRounds = this.config.get<number>('bcrypt.saltRounds', 10);
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: UserRole.MEMBER,
    });
    const saved = await this.userRepository.save(user);

    return this.buildResponse(saved);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const match = await bcrypt.compare(dto.password, user.passwordHash);
    if (!match) throw new UnauthorizedException('Credenciales inválidas');

    return this.buildResponse(user);
  }

  async refresh(dto: RefreshDto): Promise<{ accessToken: string }> {
    const refreshSecret = this.config.get<string>('jwt.refreshSecret');

    // Validate JWT signature
    let payload: { sub: string; email: string; role: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Lookup in DB
    const record = await this.refreshTokenRepository.findOne({
      where: { token: dto.refreshToken },
    });
    if (!record) throw new ForbiddenException('Refresh token no encontrado');
    if (record.revokedAt) throw new ForbiddenException('Refresh token revocado');
    if (record.expiresAt < new Date()) throw new ForbiddenException('Refresh token expirado');

    const accessToken = this.jwtService.sign(
      { sub: payload.sub, email: payload.email, role: payload.role },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>('jwt.accessExpiresIn', '15m'),
      },
    );

    return { accessToken };
  }

  async logout(dto: RefreshDto): Promise<void> {
    const record = await this.refreshTokenRepository.findOne({
      where: { token: dto.refreshToken },
    });
    if (!record) throw new ForbiddenException('Refresh token no encontrado');

    record.revokedAt = new Date();
    await this.refreshTokenRepository.save(record);
  }

  private async buildResponse(user: User): Promise<AuthResponse> {
    const accessSecret = this.config.get<string>('jwt.accessSecret');
    const refreshSecret = this.config.get<string>('jwt.refreshSecret');
    const accessExpiresIn = this.config.get<string>('jwt.accessExpiresIn', '15m');
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn', '7d');

    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      secret: accessSecret,
      expiresIn: accessExpiresIn,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn,
    });

    // Persist refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const record = this.refreshTokenRepository.create({
      userId: user.id,
      token: refreshToken,
      expiresAt,
    });
    await this.refreshTokenRepository.save(record);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }
}
