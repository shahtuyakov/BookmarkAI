import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../../../config/services/config.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as Redis from 'ioredis';
import { createHash } from 'crypto';

export interface EmbeddingRequest {
  text: string;
  model?: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
  userId?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  tokenCount: number;
  cached?: boolean;
}

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly CACHE_TTL = 86400; // 24 hours
  private openaiApiKey: string;
  private defaultModel: string;
  
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly redis: Redis.Redis,
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.defaultModel = this.configService.get<string>(
      'EMBEDDING_MODEL',
      'text-embedding-3-small'
    );
  }

  async onModuleInit() {
    if (!this.openaiApiKey) {
      this.logger.warn('OpenAI API key not configured - embedding generation will fail');
    }
  }

  /**
   * Generate embedding synchronously using OpenAI API
   * This is used for real-time search queries where we can't wait for async processing
   */
  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const { text, model = this.defaultModel, userId } = request;
    
    // Check cache first
    const cacheKey = this.generateCacheKey(text, model);
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      this.logger.debug(`Cache hit for embedding: ${text.substring(0, 50)}...`);
      const data = JSON.parse(cached);
      return {
        ...data,
        cached: true,
      };
    }

    try {
      // Call OpenAI API directly
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.openai.com/v1/embeddings',
          {
            input: text,
            model: model,
            encoding_format: 'float',
          },
          {
            headers: {
              'Authorization': `Bearer ${this.openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 second timeout
          }
        )
      );

      const embedding = response.data.data[0].embedding;
      const tokenCount = response.data.usage.total_tokens;

      // Prepare response
      const result: EmbeddingResponse = {
        embedding,
        model,
        tokenCount,
        cached: false,
      };

      // Cache the result
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify({
        embedding,
        model,
        tokenCount,
      }));

      // Log usage for monitoring
      this.logger.log(`Generated embedding for query: ${text.substring(0, 50)}... (${tokenCount} tokens)`);

      return result;
    } catch (error) {
      this.logger.error('Failed to generate embedding:', error);
      
      // If it's a rate limit error, we could implement retry logic
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded - please try again later');
      }
      
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Batch generate embeddings for multiple texts
   */
  async generateBatchEmbeddings(
    texts: string[],
    model?: string
  ): Promise<EmbeddingResponse[]> {
    if (texts.length === 0) {
      return [];
    }

    // OpenAI supports batch embedding generation
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.openai.com/v1/embeddings',
          {
            input: texts,
            model: model || this.defaultModel,
            encoding_format: 'float',
          },
          {
            headers: {
              'Authorization': `Bearer ${this.openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000, // 60 second timeout for batch
          }
        )
      );

      return response.data.data.map((item: any, index: number) => ({
        embedding: item.embedding,
        model: model || this.defaultModel,
        tokenCount: Math.ceil(response.data.usage.total_tokens / texts.length), // Approximate
        cached: false,
      }));
    } catch (error) {
      this.logger.error('Failed to generate batch embeddings:', error);
      throw new Error(`Failed to generate batch embeddings: ${error.message}`);
    }
  }

  /**
   * Generate cache key for embedding
   */
  private generateCacheKey(text: string, model: string): string {
    const hash = createHash('sha256')
      .update(`${text}:${model}`)
      .digest('hex')
      .substring(0, 16);
    
    return `embedding:${model}:${hash}`;
  }

  /**
   * Validate embedding dimensions
   */
  validateEmbeddingDimensions(embedding: number[], expectedDimensions: number = 1536): boolean {
    return embedding.length === expectedDimensions;
  }

  /**
   * Get model dimensions
   */
  getModelDimensions(model: string): number {
    const dimensions: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
    };
    
    return dimensions[model] || 1536;
  }
}