import { pgTable, uuid, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { shares } from './shares';

// Define a custom vector type - corrected version
const vectorType = (size: number) => {
  return sql`vector(${size})`.asType<number[]>();
};

export const embeddings = pgTable(
  'embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shareId: uuid('share_id')
      .notNull()
      .references(() => shares.id, { onDelete: 'cascade' }),
    // Use the custom vector type correctly
    embedding: vectorType(1536).notNull(),
    dimensions: integer('dimensions').notNull().default(1536),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      shareIdIdx: index('idx_embeddings_share_id').on(table.shareId),
    };
  },
);
