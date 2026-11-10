import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false });
  configureApp(app);
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') ?? 4000;
  const prefix = config.get<string>('app.apiPrefix') ?? 'api';
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API:     http://localhost:${port}/${prefix}/v1`);
  if (config.get<boolean>('app.swaggerEnabled')) {
    logger.log(`Swagger: http://localhost:${port}/${prefix}/docs`);
  }
}
bootstrap();
