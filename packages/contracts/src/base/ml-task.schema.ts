import { z } from 'zod';

/**
 * Base schema for all ML task metadata
 */
export const MLTaskMetadataSchema = z.object({
  correlationId: z.string().uuid(),
  timestamp: z.number().positive(),
  retryCount: z.number().int().min(0).default(0),
  traceparent: z.string().optional(),
  tracestate: z.string().optional(),
});

/**
 * Task type enum for discriminated unions
 */
export const MLTaskTypeSchema = z.enum([
  'summarize_llm',
  'transcribe_whisper',
  'embed_vectors',
]);

/**
 * Base schema that all ML tasks must extend
 */
export const BaseMLTaskSchema = z.object({
  version: z.literal('1.0'),
  taskType: MLTaskTypeSchema,
  shareId: z.string().min(1),
  metadata: MLTaskMetadataSchema,
});

/**
 * Type exports
 */
export type MLTaskType = z.infer<typeof MLTaskTypeSchema>;
export type MLTaskMetadata = z.infer<typeof MLTaskMetadataSchema>;
export type BaseMLTask = z.infer<typeof BaseMLTaskSchema>;