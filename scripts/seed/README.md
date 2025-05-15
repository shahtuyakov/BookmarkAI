# BookmarkAI Seed Scripts

These scripts populate the database with test data for development and testing.

## Available Commands

- `npm run seed:all` - Seed all entities (users, shares, transcripts)
- `npm run seed:users` - Seed only users
- `npm run seed:shares` - Seed only shares 
- `npm run seed:transcripts` - Seed only transcripts
- `npm run seed:embeddings` - Trigger embedding generation
- `npm run seed:verify` - Verify seeded data
- `npm run seed:ci` - Run comprehensive CI seeding process
- `npm run seed:ci:local` - Run CI process locally

## Environments

The seed scripts support different environments:

- `development` - Default for local development
- `ci-local` - Local testing of CI pipeline
- `test` - Testing environment
- `ci` - Continuous Integration environment

## Adding More Seed Data

To add more seed data, modify the arrays in:
- `modules/users.ts`
- `modules/shares.ts`
- `modules/transcripts.ts`

## CI/CD Integration

The seed scripts are integrated with GitHub Actions. See `.github/workflows/seed-test.yml`.