import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>('apiPrefix', 'api');
  const swaggerEnabled = config.get<boolean>('swaggerEnabled', true);
  const port = config.get<number>('port', 3000);

  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Library Loans API')
      .setDescription('Examen parcial ISIS 3710 — Sistema de préstamos de biblioteca')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, doc);
  }

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Library Loans API en http://localhost:${port}/${apiPrefix}`);
  if (swaggerEnabled) {
    // eslint-disable-next-line no-console
    console.log(`Swagger UI: http://localhost:${port}/${apiPrefix}/docs`);
  }
}

bootstrap();
