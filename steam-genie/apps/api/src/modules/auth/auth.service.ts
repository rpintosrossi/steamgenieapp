import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { LoginResponse, TokenPair, JwtAccessPayload, JwtRefreshPayload } from '@steam-genie/shared-types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dni: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { dni },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateTokens(user.id, user.dni, user.primaryRole);

    return {
      ...tokens,
      user: {
        id: user.id,
        dni: user.dni,
        fullName: user.fullName,
        primaryRole: user.primaryRole as any,
        isActive: user.isActive,
      },
    };
  }

  async refresh(userId: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive || user.deletedAt) throw new UnauthorizedException('Invalid refresh token');

    return this.generateTokens(user.id, user.dni, user.primaryRole);
  }

  private async generateTokens(
    userId: string,
    dni: string,
    primaryRole: string,
  ): Promise<TokenPair> {
    const accessPayload: JwtAccessPayload = {
      sub: userId,
      dni,
      primaryRole: primaryRole as any,
    };

    const refreshPayload: JwtRefreshPayload = { sub: userId };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '90d',
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
