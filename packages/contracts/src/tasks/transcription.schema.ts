import { z } from 'zod';
import { BaseMLTaskSchema } from '../base/ml-task.schema';

/**
 * Content schema for transcription tasks
 */
export const TranscriptionContentSchema = z.object({
  mediaUrl: z.string().url(),
});

/**
 * Options schema for transcription tasks
 */
export const TranscriptionOptionsSchema = z.object({
  language: z.string().optional(),
  backend: z.enum(['api', 'local']).optional(),
  normalize: z.boolean().default(true),
  prompt: z.string().optional(),
});

/**
 * Payload schema for transcription tasks
 */
export const TranscriptionPayloadSchema = z.object({
  content: TranscriptionContentSchema,
  options: TranscriptionOptionsSchema.optional(),
});

/**
 * Complete transcription task schema
 */
export const TranscriptionTaskSchema = BaseMLTaskSchema.extend({
  taskType: z.literal('transcribe_whisper'),
  payload: TranscriptionPayloadSchema,
});

/**
 * Type exports
 */
export type TranscriptionContent = z.infer<typeof TranscriptionContentSchema>;
export type TranscriptionOptions = z.infer<typeof TranscriptionOptionsSchema>;
export type TranscriptionPayload = z.infer<typeof TranscriptionPayloadSchema>;
export type TranscriptionTask = z.infer<typeof TranscriptionTaskSchema>;