import { describe, it, expect } from '@jest/globals';
import {
  MLTaskSchema,
  SummarizationTaskSchema,
  TranscriptionTaskSchema,
  EmbeddingTaskSchema,
  BatchEmbeddingTaskSchema,
  safeValidateMLTask,
  isSummarizationTask,
  isTranscriptionTask,
  isEmbeddingTask,
  isBatchEmbeddingTask,
} from '../src';

describe('ML Task Schema Validation', () => {
  describe('Summarization Task', () => {
    const validSummarizationTask = {
      version: '1.0' as const,
      taskType: 'summarize_llm' as const,
      shareId: 'share-123',
      payload: {
        content: {
          text: 'This is a long article about AI...',
          title: 'AI Revolution',
          url: 'https://example.com/article',
        },
        options: {
          provider: 'openai' as const,
          model: 'gpt-4',
          maxLength: 500,
          style: 'brief' as const,
          backend: 'api' as const,
        },
      },
      metadata: {
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        retryCount: 0,
      },
    };

    it('should validate a correct summarization task', () => {
      const result = SummarizationTaskSchema.safeParse(validSummarizationTask);
      expect(result.success).toBe(true);
    });

    it('should reject invalid provider', () => {
      const invalid = {
        ...validSummarizationTask,
        payload: {
          ...validSummarizationTask.payload,
          options: {
            ...validSummarizationTask.payload.options,
            provider: 'invalid-provider',
          },
        },
      };
      const result = SummarizationTaskSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should work with discriminated union', () => {
      const result = MLTaskSchema.safeParse(validSummarizationTask);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(isSummarizationTask(result.data)).toBe(true);
      }
    });
  });

  describe('Transcription Task', () => {
    const validTranscriptionTask = {
      version: '1.0' as const,
      taskType: 'transcribe_whisper' as const,
      shareId: 'share-456',
      payload: {
        content: {
          mediaUrl: 'https://example.com/video.mp4',
        },
        options: {
          language: 'en',
          backend: 'api' as const,
          normalize: true,
          prompt: 'Technical discussion about...',
        },
      },
      metadata: {
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: Date.now(),
        retryCount: 0,
      },
    };

    it('should validate a correct transcription task', () => {
      const result = TranscriptionTaskSchema.safeParse(validTranscriptionTask);
      expect(result.success).toBe(true);
    });

    it('should reject invalid media URL', () => {
      const invalid = {
        ...validTranscriptionTask,
        payload: {
          ...validTranscriptionTask.payload,
          content: {
            mediaUrl: 'not-a-url',
          },
        },
      };
      const result = TranscriptionTaskSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should work with discriminated union', () => {
      const result = MLTaskSchema.safeParse(validTranscriptionTask);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(isTranscriptionTask(result.data)).toBe(true);
      }
    });
  });

  describe('Embedding Task', () => {
    const validEmbeddingTask = {
      version: '1.0' as const,
      taskType: 'embed_vectors' as const,
      shareId: 'share-789',
      payload: {
        content: {
          text: 'This is the content to embed',
          type: 'article' as const,
          metadata: { source: 'reddit' },
        },
        options: {
          embedding_type: 'content' as const,
          force_model: 'text-embedding-3-small' as const,
          chunk_strategy: 'paragraph' as const,
          backend: 'api' as const,
        },
      },
      metadata: {
        correlationId: '550e8400-e29b-41d4-a716-446655440002',
        timestamp: Date.now(),
        retryCount: 0,
      },
    };

    it('should validate a correct embedding task', () => {
      const result = EmbeddingTaskSchema.safeParse(validEmbeddingTask);
      expect(result.success).toBe(true);
    });

    it('should reject empty text', () => {
      const invalid = {
        ...validEmbeddingTask,
        payload: {
          ...validEmbeddingTask.payload,
          content: {
            ...validEmbeddingTask.payload.content,
            text: '',
          },
        },
      };
      const result = EmbeddingTaskSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should work with discriminated union', () => {
      const result = MLTaskSchema.safeParse(validEmbeddingTask);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(isEmbeddingTask(result.data)).toBe(true);
      }
    });
  });

  describe('Batch Embedding Task', () => {
    const validBatchEmbeddingTask = {
      version: '1.0' as const,
      taskType: 'embed_vectors' as const,
      shareId: 'batch-' + '550e8400-e29b-41d4-a716-446655440003',
      payload: {
        tasks: [
          {
            share_id: 'share-001',
            content: {
              text: 'First text to embed',
              type: 'caption' as const,
              metadata: {},
            },
            options: {
              embedding_type: 'content' as const,
            },
          },
          {
            share_id: 'share-002',
            content: {
              text: 'Second text to embed',
              type: 'transcript' as const,
              metadata: { duration: 120 },
            },
          },
        ],
        isBatch: true as const,
      },
      metadata: {
        correlationId: '550e8400-e29b-41d4-a716-446655440003',
        timestamp: Date.now(),
        retryCount: 0,
      },
    };

    it('should validate a correct batch embedding task', () => {
      const result = BatchEmbeddingTaskSchema.safeParse(validBatchEmbeddingTask);
      expect(result.success).toBe(true);
    });

    it('should reject batch task without batch- prefix', () => {
      const invalid = {
        ...validBatchEmbeddingTask,
        shareId: 'not-batch-id',
      };
      const result = BatchEmbeddingTaskSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should identify batch tasks correctly', () => {
      const result = BatchEmbeddingTaskSchema.safeParse(validBatchEmbeddingTask);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(isBatchEmbeddingTask(result.data)).toBe(true);
      }
    });
  });

  describe('Safe Validation', () => {
    it('should return success for valid tasks', () => {
      const task = {
        version: '1.0' as const,
        taskType: 'summarize_llm' as const,
        shareId: 'test-123',
        payload: {
          content: { text: 'Test content' },
        },
        metadata: {
          correlationId: '550e8400-e29b-41d4-a716-446655440004',
          timestamp: Date.now(),
          retryCount: 0,
        },
      };

      const result = safeValidateMLTask(task);
      expect(result.success).toBe(true);
    });

    it('should return error for invalid tasks', () => {
      const invalidTask = {
        version: '2.0', // Wrong version
        taskType: 'summarize_llm',
        shareId: 'test-123',
      };

      const result = safeValidateMLTask(invalidTask);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.length).toBeGreaterThan(0);
      }
    });
  });
});