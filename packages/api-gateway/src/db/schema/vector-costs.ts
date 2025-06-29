import { pgTable, uuid, timestamp, varchar, integer, decimal, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { shares } from './shares';

export const vectorCosts = pgTable('vector_costs', {
  id: uuid('id').primaryKey().defaultRandom(),
  shareId: uuid('share_id').references(() => shares.id, { onDelete: 'set null' }),
  model: varchar('model', { length: 50 }).notNull(),
  inputTokens: integer('input_tokens').notNull(),
  chunksGenerated: integer('chunks_generated').notNull().default(1),
  totalCost: decimal('total_cost', { precision: 10, scale: 6 }).notNull(),
  costPerToken: decimal('cost_per_token', { precision: 12, scale: 10 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    // Indexes
    createdAtIdx: index('idx_vector_costs_created_at').on(table.createdAt),
    modelIdx: index('idx_vector_costs_model').on(table.model),
    shareIdIdx: index('idx_vector_costs_share_id').on(table.shareId),
    
    // Check constraints
    inputTokensPositive: check('chk_input_tokens_positive', sql`${table.inputTokens} > 0`),
    chunksPositive: check('chk_chunks_positive', sql`${table.chunksGenerated} > 0`),
    costPositive: check('chk_cost_positive', sql`${table.totalCost} >= 0`),
    costPerTokenPositive: check('chk_cost_per_token_positive', sql`${table.costPerToken} >= 0`),
    modelValid: check('chk_model_valid', sql`${table.model} IN ('text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002')`),
  };
});

// Type exports
export type VectorCost = typeof vectorCosts.$inferSelect;
export type NewVectorCost = typeof vectorCosts.$inferInsert;

// Model enum for type safety
export enum EmbeddingModel {
  SMALL = 'text-embedding-3-small',
  LARGE = 'text-embedding-3-large',
  ADA = 'text-embedding-ada-002',
}