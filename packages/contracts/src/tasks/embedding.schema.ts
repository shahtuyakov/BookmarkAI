import { z } from 'zod';
import { BaseMLTaskSchema } from '../base/ml-task.schema';

/**
 * Content type enum for embeddings
 */
export const EmbeddingContentTypeSchema = z.enum([
  'caption',
  'transcript',
  'article',
  'comment',
  'tweet',
]);

/**
 * Content schema for embedding tasks
 */
export const EmbeddingContentSchema = z.object({
  text: z.string().min(1),
  type: EmbeddingContentTypeSchema.default('caption'),
  metadata: z.record(z.any()).default({}),
});

/**
 * Options schema for embedding tasks
 */
export const EmbeddingOptionsSchema = z.object({
  embedding_type: z.enum(['content', 'summary', 'composite']).default('content'),
  force_model: z.enum(['text-embedding-3-small', 'text-embedding-3-large']).optional(),
  chunk_strategy: z.enum(['none', 'transcript', 'paragraph', 'sentence', 'fixed']).optional(),
  backend: z.enum(['api', 'local']).optional(),
});

/**
 * Payload schema for embedding tasks
 */
export const EmbeddingPayloadSchema = z.object({
  content: EmbeddingContentSchema,
  options: EmbeddingOptionsSchema.optional(),
});

/**
 * Complete embedding task schema
 */
export const EmbeddingTaskSchema = BaseMLTaskSchema.extend({
  taskType: z.literal('embed_vectors'),
  payload: EmbeddingPayloadSchema,
});

/**
 * Batch embedding payload schema
 */
export const BatchEmbeddingItemSchema = z.object({
  share_id: z.string().min(1),
  content: EmbeddingContentSchema,
  options: EmbeddingOptionsSchema.optional(),
});

export const BatchEmbeddingPayloadSchema = z.object({
  tasks: z.array(BatchEmbeddingItemSchema),
  isBatch: z.literal(true),
});

/**
 * Batch embedding task schema
 */
export const BatchEmbeddingTaskSchema = BaseMLTaskSchema.extend({
  taskType: z.literal('embed_vectors'),
  shareId: z.string().regex(/^batch-/), // Must start with 'batch-'
  payload: BatchEmbeddingPayloadSchema,
});

/**
 * Type exports
 */
export type EmbeddingContentType = z.infer<typeof EmbeddingContentTypeSchema>;
export type EmbeddingContent = z.infer<typeof EmbeddingContentSchema>;
export type EmbeddingOptions = z.infer<typeof EmbeddingOptionsSchema>;
export type EmbeddingPayload = z.infer<typeof EmbeddingPayloadSchema>;
export type EmbeddingTask = z.infer<typeof EmbeddingTaskSchema>;
export type BatchEmbeddingItem = z.infer<typeof BatchEmbeddingItemSchema>;
export type BatchEmbeddingPayload = z.infer<typeof BatchEmbeddingPayloadSchema>;
export type BatchEmbeddingTask = z.infer<typeof BatchEmbeddingTaskSchema>;