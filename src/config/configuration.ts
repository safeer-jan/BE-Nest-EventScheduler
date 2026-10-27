import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolves the Auth Service's RSA public key, from either:
 *  - JWT_PUBLIC_KEY       (inline PEM, `\n` escapes allowed), or
 *  - JWT_PUBLIC_KEY_PATH  (file path, relative to the working directory or absolute).
 * Fails fast with a clear message so the app never boots unable to verify tokens.
 */
function resolvePublicKey(): string {
  const inline = process.env.JWT_PUBLIC_KEY;
  if (inline && inline.trim().length > 0) {
    return inline.replace(/\\n/g, '\n');
  }
  const keyPath = process.env.JWT_PUBLIC_KEY_PATH;
  if (!keyPath) {
    throw new Error('Set JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_PATH (Auth Service RS256 public key).');
  }
  const resolved = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
  try {
    return fs.readFileSync(resolved, 'utf8');
  } catch {
    throw new Error(
      `Cannot read JWT public key at "${resolved}". Copy the Auth Service's keys/public.pem there.`,
    );
  }
}

export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '4000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    swaggerEnabled: (process.env.SWAGGER_ENABLED ?? 'true') === 'true',
  },
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true',
    logging: process.env.DB_LOGGING === 'true',
    migrationsRun: process.env.DB_MIGRATIONS_RUN === 'true',
  },
  auth: {
    publicKey: resolvePublicKey(),
    issuer: process.env.JWT_ISSUER ?? 'nest-auth-service',
    audience: process.env.JWT_AUDIENCE ?? 'nest-auth-service-clients',
    adminRole: process.env.ADMIN_ROLE ?? 'admin',
  },
  authService: {
    // Base URL of the Auth Service API, including prefix and version.
    url: (process.env.AUTH_SERVICE_URL ?? 'http://localhost:3000/api/v1').replace(/\/+$/, ''),
    timeoutMs: parseInt(process.env.AUTH_SERVICE_TIMEOUT_MS ?? '5000', 10),
  },
  redis: {
    host: process.env.REDIS_HOST || undefined,
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    failOpen: (process.env.REDIS_FAIL_OPEN ?? 'true') === 'true',
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
});
