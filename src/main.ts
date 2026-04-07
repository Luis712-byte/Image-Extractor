import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AllExceptionsFilter } from './filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  
  // Servir archivos estáticos desde la carpeta public
  app.useStaticAssets(join(__dirname, '..', 'public'));
  
  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on port ${process.env.PORT ?? 3000}`);
  console.log(`Web interface available at http://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
