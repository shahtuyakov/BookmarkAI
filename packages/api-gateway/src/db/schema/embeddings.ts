import { pgTable, uuid, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';
import { shares } from './shares';

// Create a function that returns a custom vector type with specified dimensions
function vectorWithDimensions(dimensions: number) {
  return customType<{ data: number[] }>({
    dataType() {
      return `vector(${dimensions})`;
    },
  });
}

export const embeddings = pgTable('embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  shareId: uuid('share_id')
    .notNull()
    .references(() => shares.id, { onDelete: 'cascade' }),
  // Use the vector type with dimensions
  embedding: vectorWithDimensions(1536)('embedding').notNull(),
  dimensions: integer('dimensions').notNull().default(1536),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    shareIdIdx: index('idx_embeddings_share_id').on(table.shareId),
  };
});
