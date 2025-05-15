import { pgTable, uuid, timestamp, integer, index, customType } from 'drizzle-orm/pg-core';
import { shares } from './shares';

// Define a custom vector type
const vectorType = customType<{ data: number[] }>({
  name: 'vector',
  dataType() {
    return 'vector(1536)';
  },
});

export const embeddings = pgTable('embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  shareId: uuid('share_id').notNull().references(() => shares.id, { onDelete: 'cascade' }),
  // Use the custom vector type
  embedding: vectorType('embedding').notNull(),
  dimensions: integer('dimensions').notNull().default(1536),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => {
  return {
    shareIdIdx: index('idx_embeddings_share_id').on(table.shareId)
  };
});