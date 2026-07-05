import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { JwtAccessPayload, AuthUser } from '@steam-genie/shared-types';

/**
 * Extracts JWT from `?access_token=...` query param.
 * Used only for endpoints that cannot send Authorization headers
 * (e.g. Server-Sent Events opened via native EventSource).
 * All other requests must still use `Authorization: Bearer`.
 */
const fromAccessTokenQuery = (req: Request): string | null => {
  const token = req.query?.access_token;
  return typeof token === 'string' && token.length > 0 ? token : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        fromAccessTokenQuery,
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET!,
    });
  }

  async validate(payload: JwtAccessPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        dni: true,
        fullName: true,
        primaryRole: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt) throw new UnauthorizedException('User not found or inactive');

    return user as AuthUser;
  }
}
