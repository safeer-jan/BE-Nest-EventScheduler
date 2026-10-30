import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  AccessTokenPayload,
  AuthenticatedUser,
} from '../common/interfaces/authenticated-user.interface';
import { TokenBlacklistService } from './token-blacklist.service';

/**
 * Verifies access tokens issued by the external Auth Service (RS256, public key only).
 * This service never signs tokens and has no user table.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly blacklist: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      passReqToCallback: true,
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.publicKey'),
      algorithms: ['RS256'],
      issuer: config.get<string>('auth.issuer'),
      audience: config.get<string>('auth.audience'),
    });
  }

  async validate(req: Request, payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token');
    }
    if (await this.blacklist.isRevoked(payload.jti)) {
      throw new UnauthorizedException('Token has been revoked');
    }
    return {
      id: payload.sub,
      email: payload.email,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
      jti: payload.jti,
      accessToken: ExtractJwt.fromAuthHeaderAsBearerToken()(req) ?? '',
    };
  }
}
