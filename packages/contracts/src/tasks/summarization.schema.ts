import { z } from 'zod';
import { BaseMLTaskSchema } from '../base/ml-task.schema';

/**
 * Content schema for summarization tasks
 */
export const SummarizationContentSchema = z.object({
  text: z.string().min(1),
  title: z.string().optional(),
  url: z.string().url().optional(),
  contentType: z.string().optional(),
});

/**
 * Options schema for summarization tasks
 */
export const SummarizationOptionsSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'local']).optional(),
  model: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
  style: z.enum(['brief', 'detailed', 'bullets']).optional(),
  backend: z.enum(['api', 'local']).optional(),
});

/**
 * Payload schema for summarization tasks
 */
export const SummarizationPayloadSchema = z.object({
  content: SummarizationContentSchema,
  options: SummarizationOptionsSchema.optional(),
});

/**
 * Complete summarization task schema
 */
export const SummarizationTaskSchema = BaseMLTaskSchema.extend({
  taskType: z.literal('summarize_llm'),
  payload: SummarizationPayloadSchema,
});

/**
 * Type exports
 */
export type SummarizationContent = z.infer<typeof SummarizationContentSchema>;
export type SummarizationOptions = z.infer<typeof SummarizationOptionsSchema>;
export type SummarizationPayload = z.infer<typeof SummarizationPayloadSchema>;
export type SummarizationTask = z.infer<typeof SummarizationTaskSchema>;