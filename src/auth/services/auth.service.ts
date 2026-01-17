import { PrismaClient } from '@prisma/client';
import { compare, hash } from 'bcrypt';
import { sign } from 'jsonwebtoken';

import { AUTH_MESSAGE_ERROR } from './auth.constant';

import type { RegistrationDto } from '../controllers/dtos/registration.dto';
import type { GenerateTokensDto } from './auth.interface';

export class AuthService {
  constructor(private readonly db: PrismaClient) {}

  public async registration(dto: RegistrationDto) {
    const user = await this.db.user.findUnique({ where: { email: dto.email } });

    if (user) {
      // TODO: реализовать кастомный класс для ошибок
      throw Error(AUTH_MESSAGE_ERROR.EMAIL_IS_EXIST);
    }

    const passwordHash = await hash(dto.password, 3);

    const newUser = await this.db.user.create({
      data: {
        email: dto.email,
        password: passwordHash,
      },
    });

    const tokens = await this.createTokens({ ...dto, userId: newUser.id });

    return { ...newUser, ...tokens };
  }

  public async login(dto: RegistrationDto) {
    const user = await this.db.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      // TODO: реализовать кастомный класс для ошибок
      throw Error(AUTH_MESSAGE_ERROR.EMAIL_IS_NOT_EXIST);
    }

    const isPasswordEquals = compare(dto.password, user.password);

    if (!isPasswordEquals) {
      // TODO: реализовать кастомный класс для ошибок
      throw Error(AUTH_MESSAGE_ERROR.INCORRECT_CREDENTIALS);
    }

    const tokens = await this.createTokens({ ...dto, userId: user.id });
    return { ...user, ...tokens };
  }

  public async logout(refreshToken: string) {
    await this.db.userToken.deleteMany({ where: { refreshToken } });
  }

  private async createTokens(dto: GenerateTokensDto) {
    const accessToken = sign(dto, process.env.JWT_ACCESS_KEY, {
      expiresIn: '30m',
    });
    const refreshToken = sign(dto, process.env.JWT_REFRESH_KEY, {
      expiresIn: '30d',
    });

    await this.db.userToken.create({
      data: { refreshToken, userId: dto.userId },
    });

    return { accessToken, refreshToken };
  }
}
