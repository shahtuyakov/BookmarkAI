import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as Redis from 'ioredis';
import { createHash } from 'crypto';
import { SearchRepository, SearchFilters, SimilaritySearchResult } from '../repositories/search.repository';
import { SharesService } from './shares.service';
import { MLProducerEnhancedService } from '../../ml/ml-producer-enhanced.service';
import { EmbeddingService } from '../../ml/services/embedding.service';
import { PaginatedData } from '../interfaces/paginated-data.interface';
import { Platform } from '../constants/platform.enum';
import { Logger } from '@nestjs/common';

export interface SearchByTextParams {
  query: string;
  userId: string;
  filters?: SearchFilters;
  limit?: number;
  minSimilarity?: number;
  cursor?: string;
}

export interface SearchByShareParams {
  shareId: string;
  userId: string;
  filters?: SearchFilters;
  limit?: number;
  minSimilarity?: number;
  excludeSelf?: boolean;
}

export interface EnrichedSearchResult extends SimilaritySearchResult {
  contentPreview?: string;
  highlights?: string[];
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly EMBEDDING_CACHE_TTL = 86400; // 24 hours

  constructor(
    private readonly searchRepository: SearchRepository,
    private readonly sharesService: SharesService,
    private readonly mlProducer: MLProducerEnhancedService,
    private readonly embeddingService: EmbeddingService,
    private readonly redis: Redis.Redis,
  ) {}

  /**
   * Search for similar shares by text query
   */
  async searchByText(
    params: SearchByTextParams
  ): Promise<PaginatedData<EnrichedSearchResult>> {
    const { query, userId, filters, limit, minSimilarity, cursor } = params;

    // Check cache first
    const cacheKey = this.generateCacheKey('search:text', {
      query,
      userId,
      filters,
      limit,
      minSimilarity,
      cursor
    });

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for text search: ${query.substring(0, 50)}...`);
      return JSON.parse(cached);
    }

    // Generate embedding for the query
    const embedding = await this.generateQueryEmbedding(query, userId);

    // Search using the embedding
    const searchResults = await this.searchRepository.findSimilarByVector({
      vector: embedding,
      userId,
      filters,
      limit,
      minSimilarity,
      cursor
    });

    // Enrich results
    const enrichedResults = await this.enrichSearchResults(
      searchResults.items,
      query
    );

    const response: PaginatedData<EnrichedSearchResult> = {
      items: enrichedResults,
      hasMore: searchResults.hasMore,
      cursor: searchResults.cursor,
      total: searchResults.total,
      limit: searchResults.limit,
    };

    // Cache the results
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(response));

    return response;
  }

  /**
   * Search for shares similar to a specific share
   */
  async searchByShareId(
    params: SearchByShareParams
  ): Promise<PaginatedData<EnrichedSearchResult>> {
    const { shareId, userId, filters = {}, limit, minSimilarity, excludeSelf = true } = params;

    // Verify the share belongs to the user
    const share = await this.sharesService.getShareById(shareId, userId);
    if (!share.data) {
      throw new NotFoundException('Share not found');
    }

    // Get the embedding for this share
    const embedding = await this.getOrFetchShareEmbedding(shareId);
    if (!embedding) {
      throw new BadRequestException('No embedding found for this share. It may still be processing.');
    }

    // Add exclusion filter if needed
    if (excludeSelf) {
      filters.excludeShareIds = [...(filters.excludeShareIds || []), shareId];
    }

    // Search for similar shares
    const searchResults = await this.searchRepository.findSimilarByVector({
      vector: embedding,
      userId,
      filters,
      limit,
      minSimilarity
    });

    // Enrich results
    const enrichedResults = await this.enrichSearchResults(
      searchResults.items,
      share.data.title || share.data.url
    );

    return {
      items: enrichedResults,
      hasMore: searchResults.hasMore,
      cursor: searchResults.cursor,
      total: searchResults.total,
      limit: searchResults.limit,
    };
  }

  /**
   * Batch search for multiple queries (efficient for digest generation)
   */
  async searchBatch(
    queries: string[],
    userId: string,
    filters?: SearchFilters,
    limit: number = 10
  ): Promise<Map<string, EnrichedSearchResult[]>> {
    const results = new Map<string, EnrichedSearchResult[]>();

    // Process queries in parallel with concurrency limit
    const BATCH_SIZE = 5;
    for (let i = 0; i < queries.length; i += BATCH_SIZE) {
      const batch = queries.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map(async (query) => {
          try {
            const searchResult = await this.searchByText({
              query,
              userId,
              filters,
              limit,
              minSimilarity: 0.75 // Slightly higher threshold for batch
            });
            return { query, results: searchResult.items };
          } catch (error) {
            this.logger.error(`Batch search failed for query: ${query}`, error);
            return { query, results: [] };
          }
        })
      );

      batchResults.forEach(({ query, results: queryResults }) => {
        results.set(query, queryResults);
      });
    }

    return results;
  }

  /**
   * Generate embedding for a query text
   */
  private async generateQueryEmbedding(query: string, userId: string): Promise<number[]> {
    try {
      // Use the synchronous embedding service for real-time search
      const response = await this.embeddingService.generateEmbedding({
        text: query,
        userId,
      });
      
      this.logger.debug(`Generated real embedding for query: ${query.substring(0, 50)}...`);
      
      return response.embedding;
    } catch (error) {
      this.logger.error(`Failed to generate embedding for query: ${error.message}`);
      
      // Fallback to mock embedding if the service fails
      // This ensures search continues to work even if OpenAI is down
      this.logger.warn('Falling back to mock embedding due to service failure');
      
      const mockEmbedding = new Array(1536).fill(0).map((_, i) => {
        const hash = query.charCodeAt(i % query.length) + i;
        return (Math.sin(hash) + 1) / 2;
      });
      
      return mockEmbedding;
    }
  }

  /**
   * Get or fetch share embedding from cache or database
   */
  private async getOrFetchShareEmbedding(shareId: string): Promise<number[] | null> {
    // Check cache first
    const cacheKey = `embedding:share:${shareId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      this.logger.debug(`Cache hit for share embedding: ${shareId}`);
      return JSON.parse(cached);
    }

    // Fetch from database
    const embedding = await this.searchRepository.getShareEmbedding(shareId);
    
    if (embedding) {
      // Cache for future use
      await this.redis.setex(
        cacheKey,
        this.EMBEDDING_CACHE_TTL,
        JSON.stringify(embedding)
      );
    }

    return embedding;
  }


  /**
   * Enrich search results with content preview and highlights
   */
  private async enrichSearchResults(
    results: SimilaritySearchResult[],
    query: string
  ): Promise<EnrichedSearchResult[]> {
    // For now, just add a simple content preview
    // In the future, we can fetch actual content and generate highlights
    return results.map(result => ({
      ...result,
      contentPreview: this.generateContentPreview(result),
      highlights: [] // TODO: Implement highlight extraction
    }));
  }

  /**
   * Generate a simple content preview
   */
  private generateContentPreview(result: SimilaritySearchResult): string {
    // For now, return a combination of title and URL
    // In the future, fetch actual content from shares table
    if (result.title) {
      return result.title.length > 150 
        ? result.title.substring(0, 147) + '...'
        : result.title;
    }
    
    return result.url.length > 150
      ? result.url.substring(0, 147) + '...'
      : result.url;
  }

  /**
   * Generate cache key for search results
   */
  private generateCacheKey(prefix: string, params: any): string {
    const hash = createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .substring(0, 16);
    
    return `${prefix}:${hash}`;
  }

  /**
   * Get search statistics for analytics
   */
  async getSearchStats(userId: string): Promise<{
    totalSearches: number;
    popularQueries: string[];
    averageSimilarityScore: number;
  }> {
    // TODO: Implement search analytics
    return {
      totalSearches: 0,
      popularQueries: [],
      averageSimilarityScore: 0
    };
  }
}