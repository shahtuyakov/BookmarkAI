import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { getQueueToken } from '@nestjs/bull';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { SHARE_QUEUE } from './modules/shares/queue/share-queue.constants';
import { ConfigService } from './config/services/config.service';
import { corsConfig } from './config/cors';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Create a Fastify-based NestJS application
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
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

  // Get ConfigService for interceptor
  const configService = app.get(ConfigService);

  // Apply global exception filter
  app.useGlobalFilters(new ApiExceptionFilter());

  // Apply response envelope interceptor globally
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(configService));

  const config = new DocumentBuilder()
    .setTitle('BookmarkAI API')
    .setDescription('API for BookmarkAI service')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Set global prefix for all routes
  app.setGlobalPrefix('api');

  // Setup Bull Board UI
  if (process.env.NODE_ENV !== 'production') {
    const configService = app.get(ConfigService);
    const shareQueue = app.get(getQueueToken(SHARE_QUEUE.NAME));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createBullBoard } = require('@bull-board/api');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BullAdapter } = require('@bull-board/api/bullAdapter');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { FastifyAdapter } = require('@bull-board/fastify');

    const serverAdapter = new FastifyAdapter();
    serverAdapter.setBasePath('/api/admin/queues');

    createBullBoard({
      queues: [new BullAdapter(shareQueue)],
      serverAdapter,
    });

    // Get the Fastify instance
    const fastifyInstance = app.getHttpAdapter().getInstance();

    // Add basic auth hook
    fastifyInstance.addHook('preHandler', (request, reply, done) => {
      // Only apply to bull board routes
      if (!request.url.startsWith('/api/admin/queues')) {
        return done();
      }

      const isSecured = configService.get('SECURE_ADMIN', 'true') === 'true';

      if (isSecured) {
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Basic ')) {
          reply
            .code(401)
            .header('WWW-Authenticate', 'Basic realm="Bull Board"')
            .send('Unauthorized');
          return;
        }

        const credentials = Buffer.from(authHeader.split(' ')[1], 'base64')
          .toString('utf-8')
          .split(':');

        const username = credentials[0];
        const password = credentials[1];

        const expectedUsername = configService.get('ADMIN_USERNAME', 'admin');
        const expectedPassword = configService.get('ADMIN_PASSWORD', 'admin123');

        if (username !== expectedUsername || password !== expectedPassword) {
          reply
            .code(401)
            .header('WWW-Authenticate', 'Basic realm="Bull Board"')
            .send('Unauthorized');
          return;
        }
      }

      done();
    });

    // Register the Bull Board routes
    serverAdapter.setBasePath('/api/admin/queues');
    fastifyInstance.register(serverAdapter.registerPlugin(), { prefix: '/api/admin/queues' });

    logger.log('Bull Board UI enabled at /api/admin/queues');
  }

  // Enable CORS with ngrok support (ADR-010)
  app.enableCors(corsConfig);

  // Start the server
  const port = process.env.PORT || 3001;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);
  logger.log(`Application is running on: ${await app.getUrl()}`);
  logger.log(`Swagger documentation available at: ${await app.getUrl()}/api/docs`);
}

bootstrap();
