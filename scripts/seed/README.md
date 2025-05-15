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
- `npm run seed:clean` - Clean existing seed data before seeding

## Environments

The seed scripts support different environments:

- `development` - Default for local development
- `ci-local` - Local testing of CI pipeline
- `test` - Testing environment
- `ci` - Continuous Integration environment

## Data Structure

The seed data populates tables for:

- **Users** - Test accounts with different subscription tiers
- **Shares** - Bookmarked content from various platforms (TikTok, Reddit, Twitter)
- **Transcripts** - Text content and segments for shared content
- **Embeddings** - Triggers vector embedding generation via Redis queue

## Adding More Seed Data

To add more seed data, modify the arrays in:
- `modules/users.ts`
- `modules/shares.ts`
- `modules/transcripts.ts`

## CI/CD Integration

The seed scripts are integrated with GitHub Actions. See `.github/workflows/seed-test.yml`.

## Directory Structure

```
scripts/seed/
├── index.ts         # Main entry point
├── config.ts        # Seed configuration
├── environments.ts  # Environment-specific configs
├── ci.ts            # CI/CD process manager
├── verify.ts        # Verification utilities
├── types.ts         # TypeScript interfaces
├── utils.ts         # Shared utilities
└── modules/         # Individual seed modules
    ├── users.ts     # User seed script
    ├── shares.ts    # Shares seed script
    ├── transcripts.ts  # Transcripts seed script
    └── embeddings.ts   # Embedding trigger script
```