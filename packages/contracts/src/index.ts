import { z } from 'zod';

// Export base schemas
export * from './base/ml-task.schema';

// Export task-specific schemas
export * from './tasks/summarization.schema';
export * from './tasks/transcription.schema';
export * from './tasks/embedding.schema';

// Import schemas for unified type
import { SummarizationTaskSchema } from './tasks/summarization.schema';
import { TranscriptionTaskSchema } from './tasks/transcription.schema';
import { EmbeddingTaskSchema, BatchEmbeddingTaskSchema } from './tasks/embedding.schema';

/**
 * Unified ML task schema using discriminated union
 */
export const MLTaskSchema = z.discriminatedUnion('taskType', [
  SummarizationTaskSchema,
  TranscriptionTaskSchema,
  EmbeddingTaskSchema,
]);

/**
 * Schema that includes batch embedding tasks
 */
export const MLTaskWithBatchSchema = z.union([
  MLTaskSchema,
  BatchEmbeddingTaskSchema,
]);

/**
 * Type for any ML task
 */
export type MLTask = z.infer<typeof MLTaskSchema>;
export type MLTaskWithBatch = z.infer<typeof MLTaskWithBatchSchema>;

/**
 * Validation functions
 */
export function validateMLTask(data: unknown): MLTask {
  return MLTaskSchema.parse(data);
}

export function validateMLTaskWithBatch(data: unknown): MLTaskWithBatch {
  return MLTaskWithBatchSchema.parse(data);
}

/**
 * Safe validation functions that return success/error
 */
export function safeValidateMLTask(data: unknown) {
  return MLTaskSchema.safeParse(data);
}

export function safeValidateMLTaskWithBatch(data: unknown) {
  return MLTaskWithBatchSchema.safeParse(data);
}

/**
 * Type guards
 */
export function isSummarizationTask(task: MLTask): task is z.infer<typeof SummarizationTaskSchema> {
  return task.taskType === 'summarize_llm';
}

export function isTranscriptionTask(task: MLTask): task is z.infer<typeof TranscriptionTaskSchema> {
  return task.taskType === 'transcribe_whisper';
}

export function isEmbeddingTask(task: MLTask): task is z.infer<typeof EmbeddingTaskSchema> {
  return task.taskType === 'embed_vectors';
}

export function isBatchEmbeddingTask(task: MLTaskWithBatch): task is z.infer<typeof BatchEmbeddingTaskSchema> {
  return task.taskType === 'embed_vectors' && task.shareId.startsWith('batch-');
}