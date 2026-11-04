import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface UserSummary {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Reads the user list from the Auth Service (single source of truth for users).
 * The caller's own bearer token is forwarded, so the Auth Service decides who may list users.
 */
@Injectable()
export class AuthUsersClient {
  private readonly logger = new Logger(AuthUsersClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('authService.url') ?? 'http://localhost:3000/api/v1';
    this.timeoutMs = config.get<number>('authService.timeoutMs') ?? 5000;
  }

  async listUsers(accessToken: string): Promise<UserSummary[]> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/users`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.logger.error(`Auth Service unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Auth Service is unreachable');
    }
    if (res.status === 401 || res.status === 403) {
      throw new ForbiddenException('Auth Service refused to list users (needs users:read)');
    }
    if (!res.ok) {
      this.logger.error(`Auth Service returned ${res.status} for GET /users`);
      throw new ServiceUnavailableException('Auth Service could not list users');
    }
    const body = (await res.json()) as Array<Record<string, unknown>>;
    return body
      .filter((u) => u.isActive !== false)
      .map((u) => ({
        id: String(u.id),
        email: String(u.email),
        firstName: (u.firstName as string | null | undefined) ?? null,
        lastName: (u.lastName as string | null | undefined) ?? null,
      }));
  }

  async assertUserExists(accessToken: string, userId: string): Promise<void> {
    const users = await this.listUsers(accessToken);
    if (!users.some((u) => u.id === userId)) {
      throw new BadRequestException('userId does not reference an existing user');
    }
  }
}
