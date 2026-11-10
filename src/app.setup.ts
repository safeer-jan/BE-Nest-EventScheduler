import { ClassSerializerInterceptor, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/** Shared by main.ts and the e2e tests so tests exercise the exact production configuration. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>('app.apiPrefix') ?? 'api';

  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // Keeps Swagger UI working over plain http://localhost (Safari would otherwise upgrade assets to https).
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );

  const origins = (config.get<string>('app.corsOrigin') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  if (config.get<boolean>('app.swaggerEnabled')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Calendar & Timeline Scheduler API')
        .setDescription(
          'Phase 1: scheduling calendar (events assigned to users; admins can manage every user events). ' +
            'Authentication is handled by the external Auth Service: log in there, then click ' +
            '"Authorize" and paste the accessToken. No broadcasting or playback exists in this API.',
        )
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
        .build(),
    );
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }
}
