import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(4000),
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  SWAGGER_ENABLED: Joi.string().valid('true', 'false').default('true'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.string().valid('true', 'false').default('false'),
  DB_LOGGING: Joi.string().valid('true', 'false').default('false'),
  DB_MIGRATIONS_RUN: Joi.string().valid('true', 'false').default('false'),

  JWT_PUBLIC_KEY: Joi.string().allow('').optional(),
  JWT_PUBLIC_KEY_PATH: Joi.string().allow('').optional(),
  JWT_ISSUER: Joi.string().default('nest-auth-service'),
  JWT_AUDIENCE: Joi.string().default('nest-auth-service-clients'),
  ADMIN_ROLE: Joi.string().default('admin'),

  AUTH_SERVICE_URL: Joi.string().uri().default('http://localhost:3000/api/v1'),
  AUTH_SERVICE_TIMEOUT_MS: Joi.number().default(5000),

  REDIS_HOST: Joi.string().allow('').optional(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_FAIL_OPEN: Joi.string().valid('true', 'false').default('true'),

  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),
});
