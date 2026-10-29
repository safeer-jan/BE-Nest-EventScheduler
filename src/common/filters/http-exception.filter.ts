import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Central error handler. Every error leaves the API in the same shape:
 * { statusCode, error, message (string | string[]), path, timestamp }.
 * Unknown errors are logged server-side and returned as a generic 500 (no stack traces leak).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp ? exception.getResponse() : null;

    let message: string | string[] = 'Internal server error';
    let error: string = HttpStatus[status] ?? 'Error';
    if (typeof body === 'string') {
      message = body;
    } else if (body && typeof body === 'object') {
      const b = body as { message?: string | string[]; error?: string };
      message = b.message ?? message;
      error = b.error ?? error;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
