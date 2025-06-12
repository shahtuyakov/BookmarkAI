// Set up test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/bookmarkai_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_PRIVATE_KEY_PATH = './dev/keys/private.pem';
process.env.JWT_PUBLIC_KEY_PATH = './dev/keys/public.pem';

// Ensure test database and Redis are available
// Contract tests will set up their own state via state handlers