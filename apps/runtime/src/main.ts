import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();
  const port = process.env.RUNTIME_PORT ? parseInt(process.env.RUNTIME_PORT, 10) : 3001;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`runtime service listening on ${port} (mode=${process.env.LLM_MODE || 'mock'})`);
}

bootstrap();
