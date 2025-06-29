import { pgTable, uuid, timestamp, varchar, integer, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { shares } from './shares';

export const mlResults = pgTable('ml_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  shareId: uuid('share_id').notNull().references(() => shares.id, { onDelete: 'cascade' }),
  taskType: varchar('task_type', { length: 50 }).notNull(),
  resultData: jsonb('result_data').notNull(),
  modelVersion: varchar('model_version', { length: 100 }),
  processingMs: integer('processing_ms'),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => {
  return {
    shareIdIdx: index('idx_ml_results_share_id').on(table.shareId),
    taskTypeIdx: index('idx_ml_results_task_type').on(table.taskType),
    createdAtIdx: index('idx_ml_results_created_at').on(table.createdAt),
    shareTaskUnique: unique('uq_share_task').on(table.shareId, table.taskType)
  };
});

// Type definitions for ML result data
export type MLResultData = {
  // Common fields
  status: 'success' | 'failed';
  error?: string;
  
  // Summarization specific
  summary?: string;
  keyPoints?: string[];
  wordCount?: number;
  summaryWordCount?: number;
  
  // Transcription specific
  transcript?: string;
  language?: string;
  duration?: number;
  
  // Embedding specific
  embeddings?: number[];
  dimensions?: number;
  
  // Provider info
  provider?: string;
  model?: string;
  tokensUsed?: number;
};

export type TaskType = 'summarize_llm' | 'transcribe_whisper' | 'embed_vectors';