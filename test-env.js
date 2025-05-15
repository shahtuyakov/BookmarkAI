// test-env.js
require('dotenv').config();

console.log('BookmarkAI Environment Test');
console.log('===========================');

// Database
console.log('Database Configuration:');
console.log(`  PostgreSQL Host: ${process.env.POSTGRES_HOST || 'Not set'}`);
console.log(`  PostgreSQL Port: ${process.env.POSTGRES_PORT || 'Not set'}`);
console.log(`  PostgreSQL Database: ${process.env.POSTGRES_DB || 'Not set'}`);
console.log('');

// Redis
console.log('Redis Configuration:');
console.log(`  Redis Host: ${process.env.REDIS_HOST || 'Not set'}`);
console.log(`  Redis Port: ${process.env.REDIS_PORT || 'Not set'}`);
console.log('');

// S3/MinIO
console.log('Storage Configuration:');
console.log(`  S3 Endpoint: ${process.env.S3_ENDPOINT || 'Not set'}`);
console.log(`  Media Bucket: ${process.env.S3_BUCKET_MEDIA || 'Not set'}`);
console.log('');

// API
console.log('API Configuration:');
console.log(`  API Port: ${process.env.API_PORT || 'Not set'}`);
console.log('');

console.log('Test complete. If variables show as "Not set", make sure you have copied');
console.log('.env.example to .env and sourced it in your environment.');