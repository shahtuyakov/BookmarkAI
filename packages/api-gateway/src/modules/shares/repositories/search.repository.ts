import { Injectable } from '@nestjs/common';
import { SQL, sql, and, gte, lte, eq } from 'drizzle-orm';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { shares } from '../../../db/schema/shares';
import { embeddings } from '../../../db/schema/embeddings';
import { Platform } from '../constants/platform.enum';
import { PaginatedData } from '../interfaces/paginated-data.interface';

export interface SearchFilters {
  platform?: Platform;
  contentType?: string;
  startDate?: Date;
  endDate?: Date;
  excludeShareIds?: string[];
}

export interface SimilaritySearchResult {
  shareId: string;
  embeddingId: string;
  similarity: number;
  url: string;
  title: string | null;
  contentType: string;
  platform: Platform;
  thumbnailUrl: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

export interface SearchByVectorParams {
  vector: number[];
  userId: string;
  filters?: SearchFilters;
  limit?: number;
  minSimilarity?: number;
  cursor?: string; // similarity score for pagination
}

@Injectable()
export class SearchRepository {
  constructor(
    private readonly db: DrizzleService,
  ) {}

  /**
   * Find similar shares by vector using pgvector cosine similarity
   */
  async findSimilarByVector(
    params: SearchByVectorParams
  ): Promise<PaginatedData<SimilaritySearchResult>> {
    const {
      vector,
      userId,
      filters = {},
      limit = 20,
      minSimilarity = 0.7,
      cursor
    } = params;

    // Convert vector to PostgreSQL array format
    const vectorStr = `[${vector.join(',')}]`;

    // Build WHERE conditions
    const conditions: SQL[] = [
      sql`s.user_id = ${userId}`,
      sql`1 - (e.embedding <=> ${vectorStr}::vector) >= ${minSimilarity}`
    ];

    // Apply filters
    if (filters.platform) {
      conditions.push(eq(shares.platform, filters.platform));
    }

    if (filters.contentType) {
      conditions.push(eq(shares.mediaType, filters.contentType));
    }

    if (filters.startDate) {
      conditions.push(gte(shares.createdAt, filters.startDate));
    }

    if (filters.endDate) {
      conditions.push(lte(shares.createdAt, filters.endDate));
    }

    if (filters.excludeShareIds && filters.excludeShareIds.length > 0) {
      conditions.push(sql`s.id NOT IN (${sql.join(
        filters.excludeShareIds.map(id => sql`${id}`),
        sql`, `
      )})`);
    }

    // Apply cursor-based pagination
    if (cursor) {
      const cursorSimilarity = parseFloat(cursor);
      conditions.push(sql`1 - (e.embedding <=> ${vectorStr}::vector) < ${cursorSimilarity}`);
    }

    // Build the query
    const query = sql`
      SELECT 
        s.id as share_id,
        e.id as embedding_id,
        1 - (e.embedding <=> ${vectorStr}::vector) as similarity,
        s.url,
        s.title,
        s.media_type as content_type,
        s.platform,
        s.thumbnail_url,
        s.created_at,
        s.updated_at as processed_at
      FROM ${embeddings} e
      INNER JOIN ${shares} s ON e.share_id = s.id
      WHERE ${and(...conditions)}
      ORDER BY similarity DESC
      LIMIT ${limit + 1}
    `;

    const results = await this.db.database.execute(query);
    const rows = results.rows as any[];
    
    // Check if there are more results
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Get the next cursor
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].similarity.toString()
      : null;

    // Map results
    const mappedItems: SimilaritySearchResult[] = items.map(row => ({
      shareId: row.share_id,
      embeddingId: row.embedding_id,
      similarity: parseFloat(row.similarity),
      url: row.url,
      title: row.title,
      contentType: row.content_type,
      platform: row.platform as Platform,
      thumbnailUrl: row.thumbnail_url,
      createdAt: row.created_at,
      processedAt: row.processed_at,
    }));

    return {
      items: mappedItems,
      hasMore,
      cursor: nextCursor,
      total: null, // We don't calculate total for performance reasons
      limit,
    };
  }

  /**
   * Get embedding vector for a specific share
   */
  async getShareEmbedding(shareId: string): Promise<number[] | null> {
    const result = await this.db.database
      .select({
        embedding: sql<string>`e.embedding::text`,
      })
      .from(embeddings)
      .where(eq(embeddings.shareId, shareId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    // Parse vector from string format
    const vectorStr = result[0].embedding;
    const vector = vectorStr
      .replace(/[\[\]]/g, '')
      .split(',')
      .map(x => parseFloat(x.trim()));

    return vector;
  }

  /**
   * Count similar shares (for analytics)
   */
  async countSimilarShares(
    vector: number[],
    userId: string,
    minSimilarity: number = 0.7
  ): Promise<number> {
    const vectorStr = `[${vector.join(',')}]`;

    const result = await this.db.database.execute(sql`
      SELECT COUNT(*) as count
      FROM ${embeddings} e
      INNER JOIN ${shares} s ON e.share_id = s.id
      WHERE s.user_id = ${userId}
        AND 1 - (e.embedding <=> ${vectorStr}::vector) >= ${minSimilarity}
    `);

    return parseInt(result[0].count, 10);
  }

  /**
   * Get multiple share embeddings in batch (for performance)
   */
  async getShareEmbeddingsBatch(shareIds: string[]): Promise<Map<string, number[]>> {
    if (shareIds.length === 0) {
      return new Map();
    }

    const results = await this.db.database.execute(sql`
      SELECT 
        share_id,
        embedding::text as embedding
      FROM ${embeddings}
      WHERE share_id IN (${sql.join(
        shareIds.map(id => sql`${id}`),
        sql`, `
      )})
    `);

    const embeddingMap = new Map<string, number[]>();
    const rows = results.rows as any[];
    
    for (const row of rows) {
      const vector = row.embedding
        .replace(/[\[\]]/g, '')
        .split(',')
        .map((x: string) => parseFloat(x.trim()));
      
      embeddingMap.set(row.share_id, vector);
    }

    return embeddingMap;
  }

  /**
   * Check if embeddings exist for shares
   */
  async checkEmbeddingsExist(shareIds: string[]): Promise<Set<string>> {
    if (shareIds.length === 0) {
      return new Set();
    }

    const results = await this.db.database
      .select({
        shareId: embeddings.shareId,
      })
      .from(embeddings)
      .where(sql`${embeddings.shareId} IN (${sql.join(
        shareIds.map(id => sql`${id}`),
        sql`, `
      )})`);

    return new Set(results.map(r => r.shareId));
  }
}