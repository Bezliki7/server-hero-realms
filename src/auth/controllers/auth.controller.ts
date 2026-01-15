import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { AuthService } from '../services/auth.service';
import { THIRTY_DAYS } from '../services/auth.constant';

import type { RegistrationDto } from './dtos/registration.dto';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  public async registration(
    @Res() res: Response,
    @Body() dto: RegistrationDto,
  ) {
    const { refreshToken, ...result } = await this.auth.registration(dto);

    res.cookie('refreshToken', refreshToken, {
      maxAge: THIRTY_DAYS,
      httpOnly: true,
    });

    return result;
  }

  @Post('login')
  public async login(@Res() res: Response, @Body() dto: RegistrationDto) {
    const { refreshToken, ...result } = await this.auth.login(dto);

    res.cookie('refreshToken', refreshToken, {
      maxAge: THIRTY_DAYS,
      httpOnly: true,
    });

    return result;
  }

  @Post('logout')
  public async logout(@Req() req: Request) {
    const { refreshToken } = req.cookies;

    await this.auth.logout(refreshToken);
  }
}
