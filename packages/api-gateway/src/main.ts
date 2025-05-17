import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ResponseFormatInterceptor } from './common/interceptors/response-format.interceptor';
import fastifyCookie from '@fastify/cookie';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Create a Fastify-based NestJS application
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ 
      logger: true,
      // Disable static file serving to prevent @fastify/static loading
      disableRequestLogging: true,
    }),
  );

  // Register cookie parser
  await app.register(fastifyCookie);

  // Apply global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Apply response format interceptor globally
  app.useGlobalInterceptors(new ResponseFormatInterceptor());

  const config = new DocumentBuilder()
    .setTitle('BookmarkAI API')
    .setDescription('API for BookmarkAI service')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document)

  // Set global prefix for all routes
  app.setGlobalPrefix('api');

  // Enable CORS for development
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Start the server
  const port = process.env.PORT || 3001;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);
  logger.log(`Application is running on: ${await app.getUrl()}`);
  logger.log(`Swagger documentation available at: ${await app.getUrl()}/api/docs`);
}

bootstrap();