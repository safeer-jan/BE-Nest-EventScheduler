import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * OPTIONAL revocation check against the Auth Service's Redis.
 * The Auth Service writes `blacklist:<jti>` on logout; if REDIS_HOST is configured here
 * (same Redis), revoked tokens are rejected immediately. If not configured, this is a no-op
 * and tokens stay valid until they expire.
 */
@Injectable()
export class TokenBlacklistService implements OnModuleDestroy {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly client: Redis | null = null;
  private readonly failOpen: boolean;

  constructor(config: ConfigService) {
    const host = config.get<string | undefined>('redis.host');
    this.failOpen = config.get<boolean>('redis.failOpen') ?? true;
    if (host) {
      this.client = new Redis({
        host,
        port: config.get<number>('redis.port') ?? 6379,
        password: config.get<string | undefined>('redis.password'),
        maxRetriesPerRequest: 1,
      });
      this.client.on('error', (err: Error) => this.logger.warn(`Redis error: ${err.message}`));
      this.logger.log(`Token revocation check enabled (Redis ${host})`);
    } else {
      this.logger.log('Token revocation check disabled (REDIS_HOST not set)');
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async isRevoked(jti?: string): Promise<boolean> {
    if (!this.client || !jti) return false;
    try {
      return (await this.client.get(`blacklist:${jti}`)) !== null;
    } catch (err) {
      this.logger.error(`Revocation lookup failed: ${(err as Error).message}`);
      if (this.failOpen) return false;
      throw new ServiceUnavailableException('Unable to verify token status');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
