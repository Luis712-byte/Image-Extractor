import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        details = (exceptionResponse as any);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Log detallado del error
    this.logger.error(`HTTP ${status} Error:`, {
      message,
      details,
      url: request.url,
      method: request.method,
      body: request.body,
      headers: request.headers,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    const errorResponse = {
      success: false,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }
}
