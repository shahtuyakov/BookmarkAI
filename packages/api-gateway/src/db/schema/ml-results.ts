import { pgTable, uuid, varchar, jsonb, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { shares } from './shares';

export const mlResults = pgTable(
  'ml_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shareId: uuid('share_id')
      .notNull()
      .references(() => shares.id, { onDelete: 'cascade' }),
    taskType: varchar('task_type', { length: 50 }).notNull(),
    resultData: jsonb('result_data'),
    modelVersion: varchar('model_version', { length: 100 }),
    processingMs: integer('processing_ms'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    shareTaskUnique: uniqueIndex('ml_results_share_task_unique').on(
      table.shareId,
      table.taskType
    ),
    shareIdIdx: index('ml_results_share_id_idx').on(table.shareId),
    taskTypeIdx: index('ml_results_task_type_idx').on(table.taskType),
    createdAtIdx: index('ml_results_created_at_idx').on(table.createdAt),
  })
);

export type MlResult = typeof mlResults.$inferSelect;
export type NewMlResult = typeof mlResults.$inferInsert;