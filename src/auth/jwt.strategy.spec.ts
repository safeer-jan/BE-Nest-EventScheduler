import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import { JwtStrategy } from './jwt.strategy';
import { TokenBlacklistService } from './token-blacklist.service';

const { publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const req = { headers: { authorization: 'Bearer tok' } } as never;

function setup(revoked = false) {
  const config = {
    get: (k: string) =>
      ({ 'auth.publicKey': publicKey, 'auth.issuer': 'iss', 'auth.audience': 'aud' })[k],
  } as unknown as ConfigService;
  const blacklist = { isRevoked: jest.fn().mockResolvedValue(revoked) } as unknown as TokenBlacklistService;
  return { strategy: new JwtStrategy(config, blacklist), blacklist };
}

describe('JwtStrategy.validate', () => {
  it('maps token claims to the authenticated user', async () => {
    const { strategy } = setup();
    const user = await strategy.validate(req, {
      sub: 'u-1',
      email: 'a@b.c',
      roles: ['admin'],
      permissions: ['ignored:here'],
      jti: 'j-1',
    });
    expect(user).toEqual({
      id: 'u-1',
      email: 'a@b.c',
      roles: ['admin'],
      jti: 'j-1',
      accessToken: 'tok',
    });
  });

  it('defaults roles to an empty array', async () => {
    const { strategy } = setup();
    const user = await strategy.validate(req, { sub: 'u-1', email: 'a@b.c' });
    expect(user.roles).toEqual([]);
  });

  it('rejects a token without sub', async () => {
    const { strategy } = setup();
    await expect(strategy.validate(req, { email: 'a@b.c' } as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a revoked token', async () => {
    const { strategy } = setup(true);
    await expect(strategy.validate(req, { sub: 'u-1', email: 'a@b.c', jti: 'j-1' })).rejects.toThrow('revoked');
  });
});
