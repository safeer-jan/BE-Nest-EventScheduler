import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Used by the TypeORM CLI (migration:run / revert / show / generate).
 * `synchronize` is permanently false: the schema changes ONLY through migrations.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  // Postgres 13+ has gen_random_uuid() built in: no extension is installed or required.
  uuidExtension: 'pgcrypto',
  installExtensions: false,
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
});
