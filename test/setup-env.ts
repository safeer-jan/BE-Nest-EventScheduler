import { generateKeyPairSync } from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Optional overrides from .env.test; real environment variables always win.
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Throw-away RSA key pair: tests sign tokens exactly like the Auth Service would (RS256).
process.env.TEST_JWT_PRIVATE_KEY = privateKey;
process.env.JWT_PUBLIC_KEY = publicKey;

process.env.NODE_ENV = 'test';
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5433';
process.env.DB_USERNAME ??= 'postgres';
process.env.DB_PASSWORD ??= 'postgres';
process.env.DB_NAME ??= 'scheduler_test';
process.env.DB_MIGRATIONS_RUN = 'true'; // the e2e run also proves the migration applies cleanly
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.ADMIN_ROLE = 'admin';
process.env.REDIS_HOST = ''; // revocation check disabled in tests
process.env.THROTTLE_LIMIT = '100000';
process.env.SWAGGER_ENABLED = 'true';
process.env.CORS_ORIGIN = 'http://localhost:5173';
