import { Verifier } from '@pact-foundation/pact';
import { DrizzleService } from '../database/services/drizzle.service';
import { ConfigService } from '../config/services/config.service';
import { KmsJwtService } from '../modules/auth/services/kms-jwt.service';
import { users } from '../db/schema';
import * as Redis from 'ioredis';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';

describe('API Gateway Provider Contracts', () => {
  let app: INestApplication;
  let db: DrizzleService;
  let redis: Redis.Redis;
  let jwtService: KmsJwtService;
  let configService: ConfigService;
  let testAuthToken: string;

  const setupApp = async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    );
    
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get(DrizzleService);
    configService = app.get(ConfigService);
    jwtService = app.get(KmsJwtService);
    
    // Create Redis instance for tests
    redis = new Redis.Redis({
      host: configService.get('REDIS_HOST', 'localhost'),
      port: configService.get('REDIS_PORT', 6379),
    });

    return app;
  };

  beforeAll(async () => {
    await setupApp();
  });

  afterAll(async () => {
    await redis?.quit();
    await app?.close();
  });

  const verifier = new Verifier({
    provider: 'bookmarkai-api-gateway',
    providerBaseUrl: 'http://localhost:3001',
    pactUrls: [
      // In CI, this would be replaced with PactFlow URL
      `${__dirname}/../../../../packages/mobile/bookmarkaimobile/pacts/bookmarkai-react-native-bookmarkai-api-gateway.json`,
    ],
    providerVersion: process.env.GIT_COMMIT || 'local',
    logLevel: 'warn',
    
    stateHandlers: {
      'user is authenticated': async () => {
        // 1. Clean up any existing test data
        await db.database.delete(users).where(eq(users.email, 'test@example.com'));
        await redis.flushdb();

        // 2. Create test user
        const [testUser] = await db.database.insert(users).values({
          email: 'test@example.com',
          password: 'hashed_password',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        // 3. Generate valid JWT token
        const tokens = await jwtService.createTokens(testUser.id, testUser.email, 'user');
        testAuthToken = tokens.accessToken;

        // 4. Store in global context for request filter
        (global as any).testAuthToken = testAuthToken;
      },

      'user has exceeded rate limit': async () => {
        // 1. Ensure user exists (reuse from authenticated state)
        const [existingUser] = await db.database.select().from(users).where(eq(users.email, 'test@example.com'));
        
        if (!existingUser) {
          const [testUser] = await db.database.insert(users).values({
            email: 'test@example.com',
            password: 'hashed_password',
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          }).returning();

          const tokens = await jwtService.createTokens(testUser.id, testUser.email, 'user');
          testAuthToken = tokens.accessToken;
          (global as any).testAuthToken = testAuthToken;
        }

        // 2. Set rate limit to exceeded
        const userId = existingUser?.id || (await db.database.select().from(users).where(eq(users.email, 'test@example.com')))[0].id;
        const rateLimitKey = `rate-limit:shares:${userId}`;
        
        // Set count to 10 (assuming limit is 10)
        await redis.set(rateLimitKey, '10', 'EX', 60);
      },
    },

    requestFilter: (req, res, next) => {
      // Inject auth token if not present
      if ((global as any).testAuthToken && !req.headers.authorization) {
        req.headers.authorization = `Bearer ${(global as any).testAuthToken}`;
      }
      
      // Add required headers
      if (!req.headers['content-type']) {
        req.headers['content-type'] = 'application/json';
      }
      
      next();
    },

    // Clean up after each test
    afterEach: async () => {
      // Clean up test data
      await db.database.delete(users).where(eq(users.email, 'test@example.com'));
      await redis.flushdb();
      delete (global as any).testAuthToken;
    },
  });

  it('should validate all consumer contracts', async () => {
    await verifier.verifyProvider();
  });
});