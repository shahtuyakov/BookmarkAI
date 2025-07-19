import { Injectable } from '@nestjs/common';
import { eq, and, desc, sql, inArray, gte } from 'drizzle-orm';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { shares } from '../../../db/schema/shares';
import { mlResults } from '../../../db/schema/ml-results';
import { ShareStatus } from '../constants/share-status.enum';
import { Platform } from '../constants/platform.enum';
import { GetEnrichedSharesQueryDto, MLStatus } from '../dto/get-enriched-shares-query.dto';

export interface CreateShareData {
  userId: string;
  url: string;
  platform: Platform;
  status?: ShareStatus;
  idempotencyKey?: string;
  workflowState?: string;
}

export interface UpdateShareData {
  status?: ShareStatus;
  title?: string;
  description?: string;
  author?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  mediaType?: string;
  platformData?: any;
  workflowState?: string;
  enhancementStartedAt?: Date;
  enhancementCompletedAt?: Date;
  enhancementVersion?: number;
}

export interface ShareFilters {
  userId?: string;
  platform?: Platform;
  status?: ShareStatus;
  workflowState?: string;
}

/**
 * Repository for share database operations
 */
@Injectable()
export class SharesRepository {
  constructor(private readonly db: DrizzleService) {}

  /**
   * Create a new share
   */
  async create(data: CreateShareData) {
    const [newShare] = await this.db.database
      .insert(shares)
      .values({
        userId: data.userId,
        url: data.url,
        platform: data.platform,
        status: data.status || ShareStatus.PENDING,
        idempotencyKey: data.idempotencyKey,
        workflowState: data.workflowState,
      })
      .returning();
    
    return newShare;
  }

  /**
   * Find a share by ID
   */
  async findById(id: string) {
    const [share] = await this.db.database
      .select()
      .from(shares)
      .where(eq(shares.id, id))
      .limit(1);
    
    return share;
  }

  /**
   * Find a share by ID and user ID
   */
  async findByIdAndUserId(id: string, userId: string) {
    const [share] = await this.db.database
      .select()
      .from(shares)
      .where(and(eq(shares.id, id), eq(shares.userId, userId)))
      .limit(1);
    
    return share;
  }

  /**
   * Find shares by URL and user ID
   */
  async findByUrlAndUserId(url: string, userId: string) {
    return await this.db.database
      .select()
      .from(shares)
      .where(and(eq(shares.url, url), eq(shares.userId, userId)));
  }

  /**
   * Update a share by ID
   */
  async update(id: string, data: UpdateShareData) {
    const [updatedShare] = await this.db.database
      .update(shares)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(shares.id, id))
      .returning();
    
    return updatedShare;
  }

  /**
   * Update workflow state for a share
   */
  async updateWorkflowState(id: string, workflowState: string, additionalData?: {
    enhancementStartedAt?: Date;
    enhancementCompletedAt?: Date;
    enhancementVersion?: number;
  }) {
    const updateData: UpdateShareData = {
      workflowState,
      ...additionalData,
    };

    return await this.update(id, updateData);
  }

  /**
   * Start enhancement workflow
   */
  async startEnhancement(id: string, workflowState: string) {
    return await this.updateWorkflowState(id, workflowState, {
      enhancementStartedAt: new Date(),
      enhancementCompletedAt: null,
    });
  }

  /**
   * Complete enhancement workflow
   */
  async completeEnhancement(id: string, workflowState: string) {
    const [share] = await this.db.database
      .select({ enhancementVersion: shares.enhancementVersion })
      .from(shares)
      .where(eq(shares.id, id))
      .limit(1);

    const currentVersion = share?.enhancementVersion || 1;

    return await this.updateWorkflowState(id, workflowState, {
      enhancementCompletedAt: new Date(),
      enhancementVersion: currentVersion + 1,
    });
  }

  /**
   * Find shares with filters and pagination
   */
  async findWithFilters(filters: ShareFilters, options: {
    limit?: number;
    cursor?: string;
    orderBy?: 'createdAt' | 'updatedAt';
    orderDirection?: 'asc' | 'desc';
  } = {}) {
    const limit = options.limit || 20;
    const orderBy = options.orderBy || 'createdAt';
    const orderDirection = options.orderDirection || 'desc';

    // Build where conditions
    const conditions = [];
    
    if (filters.userId) {
      conditions.push(eq(shares.userId, filters.userId));
    }
    
    if (filters.platform) {
      conditions.push(eq(shares.platform, filters.platform));
    }
    
    if (filters.status) {
      conditions.push(eq(shares.status, filters.status));
    }
    
    if (filters.workflowState) {
      conditions.push(eq(shares.workflowState, filters.workflowState));
    }

    // Parse cursor if provided
    if (options.cursor) {
      try {
        const [timestamp, id] = options.cursor.split('_');
        const cursorDate = new Date(timestamp);

        if (!isNaN(cursorDate.getTime())) {
          const orderColumn = orderBy === 'createdAt' ? shares.createdAt : shares.updatedAt;
          const comparison = orderDirection === 'desc' ? '<' : '>';
          const cursorCondition = sql`(${orderColumn}, ${shares.id}) ${sql.raw(comparison)} (${cursorDate}, ${id})`;
          conditions.push(cursorCondition);
        }
      } catch (error) {
        // Invalid cursor, ignore it
      }
    }

    // Build query
    const baseQuery = this.db.database.select().from(shares);
    
    // Apply conditions
    const conditionalQuery = conditions.length > 0 
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    // Apply ordering
    const orderColumn = orderBy === 'createdAt' ? shares.createdAt : shares.updatedAt;
    const orderedQuery = orderDirection === 'desc'
      ? conditionalQuery.orderBy(desc(orderColumn), desc(shares.id))
      : conditionalQuery.orderBy(orderColumn, shares.id);

    // Fetch one extra to determine if there are more
    const results = await orderedQuery.limit(limit + 1);

    // Check if there are more items
    const hasMore = results.length > limit;
    const items = results.slice(0, limit);

    // Generate cursor for next page
    let nextCursor = undefined;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      const cursorDate = orderBy === 'createdAt' ? lastItem.createdAt : lastItem.updatedAt;
      nextCursor = `${cursorDate.toISOString()}_${lastItem.id}`;
    }

    return {
      items,
      hasMore,
      cursor: nextCursor,
      limit,
    };
  }

  /**
   * Find shares by workflow state
   */
  async findByWorkflowState(workflowState: string, limit?: number) {
    const query = this.db.database
      .select()
      .from(shares)
      .where(eq(shares.workflowState, workflowState))
      .orderBy(desc(shares.createdAt));

    if (limit) {
      query.limit(limit);
    }

    return await query;
  }

  /**
   * Find shares ready for enhancement
   */
  async findReadyForEnhancement(limit: number = 10) {
    return await this.db.database
      .select()
      .from(shares)
      .where(
        and(
          eq(shares.status, ShareStatus.DONE),
          sql`${shares.workflowState} IS NULL OR ${shares.workflowState} = 'pending'`
        )
      )
      .orderBy(shares.createdAt)
      .limit(limit);
  }

  /**
   * Find stale enhancements (started but not completed within timeout)
   */
  async findStaleEnhancements(timeoutMinutes: number = 30) {
    const timeoutDate = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    
    return await this.db.database
      .select()
      .from(shares)
      .where(
        and(
          sql`${shares.enhancementStartedAt} IS NOT NULL`,
          sql`${shares.enhancementCompletedAt} IS NULL`,
          sql`${shares.enhancementStartedAt} < ${timeoutDate}`
        )
      );
  }

  /**
   * Batch update workflow states
   */
  async batchUpdateWorkflowStates(shareIds: string[], workflowState: string) {
    if (shareIds.length === 0) {
      return [];
    }

    return await this.db.database
      .update(shares)
      .set({
        workflowState,
        updatedAt: new Date(),
      })
      .where(inArray(shares.id, shareIds))
      .returning();
  }

  /**
   * Get workflow state statistics
   */
  async getWorkflowStateStats(userId?: string) {
    const conditions = userId ? [eq(shares.userId, userId)] : [];

    const query = sql`
      SELECT 
        workflow_state,
        COUNT(*) as count,
        MIN(enhancement_started_at) as oldest_started,
        MAX(enhancement_completed_at) as latest_completed
      FROM ${shares}
      ${conditions.length > 0 ? sql`WHERE ${and(...conditions)}` : sql``}
      GROUP BY workflow_state
    `;

    const results = await this.db.database.execute(query);
    
    return results.rows.map((row: any) => ({
      workflowState: row.workflow_state as string,
      count: parseInt(row.count as string, 10),
      oldestStarted: row.oldest_started ? new Date(row.oldest_started as string) : null,
      latestCompleted: row.latest_completed ? new Date(row.latest_completed as string) : null,
    }));
  }

  /**
   * Delete a share by ID
   */
  async delete(id: string) {
    const [deletedShare] = await this.db.database
      .delete(shares)
      .where(eq(shares.id, id))
      .returning();
    
    return deletedShare;
  }

  /**
   * Find shares with ML results joined (enriched)
   */
  async findEnrichedShares(userId: string, query: GetEnrichedSharesQueryDto) {
    const limit = query.limit || 20;
    const conditions: any[] = [eq(shares.userId, userId)];

    // Platform filter
    if (query.platform && query.platform.length > 0) {
      conditions.push(inArray(shares.platform, query.platform));
    }

    // Status filter
    if (query.status && query.status.length > 0) {
      conditions.push(inArray(shares.status, query.status));
    }

    // Media type filter
    if (query.mediaType) {
      conditions.push(eq(shares.mediaType, query.mediaType));
    }

    // Date filter
    if (query.since) {
      conditions.push(gte(shares.createdAt, new Date(query.since)));
    }

    // Handle cursor for pagination
    if (query.cursor) {
      try {
        const [cursorDate, id] = query.cursor.split('_');
        if (cursorDate && id) {
          const cursorCondition = sql`(${shares.createdAt}, ${shares.id}) < (${new Date(cursorDate)}, ${id})`;
          conditions.push(cursorCondition);
        }
      } catch (error) {
        // Invalid cursor, ignore it
      }
    }

    // Build query with left join to ML results
    const results = await this.db.database
      .select({
        share: shares,
        mlResults: {
          summary: sql<any>`
            (SELECT result_data->>'summary' 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'summarize_llm' 
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
          transcript: sql<any>`
            (SELECT result_data->>'transcript' 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'transcribe_whisper' 
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
          summaryStatus: sql<string>`
            CASE 
              WHEN EXISTS (
                SELECT 1 FROM ${mlResults} 
                WHERE share_id = ${shares.id} 
                AND task_type = 'summarize_llm' 
                AND result_data->>'status' = 'success'
              ) THEN 'done'
              WHEN EXISTS (
                SELECT 1 FROM ${mlResults} 
                WHERE share_id = ${shares.id} 
                AND task_type = 'summarize_llm' 
                AND result_data->>'status' = 'failed'
              ) THEN 'failed'
              WHEN ${shares.status} = 'processing' THEN 'processing'
              WHEN ${shares.mediaType} IN ('video', 'audio') THEN 'pending'
              ELSE 'not_applicable'
            END
          `,
          transcriptStatus: sql<string>`
            CASE 
              WHEN EXISTS (
                SELECT 1 FROM ${mlResults} 
                WHERE share_id = ${shares.id} 
                AND task_type = 'transcribe_whisper' 
                AND result_data->>'status' = 'success'
              ) THEN 'done'
              WHEN EXISTS (
                SELECT 1 FROM ${mlResults} 
                WHERE share_id = ${shares.id} 
                AND task_type = 'transcribe_whisper' 
                AND result_data->>'status' = 'failed'
              ) THEN 'failed'
              WHEN ${shares.status} = 'processing' THEN 'processing'
              WHEN ${shares.mediaType} IN ('video', 'audio') THEN 'pending'
              ELSE 'not_applicable'
            END
          `,
          embeddingsStatus: sql<string>`
            CASE 
              WHEN EXISTS (
                SELECT 1 FROM ${mlResults} 
                WHERE share_id = ${shares.id} 
                AND task_type = 'embed_vectors'
              ) THEN 'done'
              WHEN ${shares.status} = 'done' THEN 'pending'
              ELSE 'not_applicable'
            END
          `,
          keyPoints: sql<string[]>`
            (SELECT result_data->'keyPoints' 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'summarize_llm' 
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
          language: sql<string>`
            (SELECT result_data->>'language' 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'transcribe_whisper' 
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
          duration: sql<number>`
            (SELECT (result_data->>'duration')::float 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'transcribe_whisper' 
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
        }
      })
      .from(shares)
      .where(and(...conditions))
      .orderBy(desc(shares.createdAt), desc(shares.id))
      .limit(limit + 1);

    // Apply ML status filter
    let filteredResults = results;
    if (query.mlStatus) {
      filteredResults = results.filter(r => {
        const summaryDone = r.mlResults.summaryStatus === 'done';
        const transcriptDone = r.mlResults.transcriptStatus === 'done';
        const embeddingsDone = r.mlResults.embeddingsStatus === 'done';
        
        switch (query.mlStatus) {
          case MLStatus.COMPLETE:
            // All applicable ML tasks are done
            const videoComplete = r.share.mediaType === 'video' || r.share.mediaType === 'audio' 
              ? summaryDone && transcriptDone : summaryDone;
            return videoComplete;
          case MLStatus.PARTIAL:
            // Some ML results available
            return summaryDone || transcriptDone || embeddingsDone;
          case MLStatus.NONE:
            // No ML results yet
            return !summaryDone && !transcriptDone && !embeddingsDone;
          case MLStatus.FAILED:
            // Any ML task failed
            return r.mlResults.summaryStatus === 'failed' || 
                   r.mlResults.transcriptStatus === 'failed';
          default:
            return true;
        }
      });
    }

    // Apply transcript filter
    if (query.hasTranscript === true) {
      filteredResults = filteredResults.filter(r => r.mlResults.transcript !== null);
    }

    // Check if there are more items
    const hasMore = filteredResults.length > limit;
    const items = filteredResults.slice(0, limit);

    // Generate cursor for next page
    let nextCursor = undefined;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = `${lastItem.share.createdAt.toISOString()}_${lastItem.share.id}`;
    }

    return {
      items,
      hasMore,
      cursor: nextCursor,
      limit,
    };
  }

  /**
   * Find a single enriched share by ID
   */
  async findEnrichedShareById(id: string, userId: string) {
    const results = await this.db.database
      .select({
        share: shares,
        mlResults: {
          summary: sql<any>`
            (SELECT result_data->>'summary' 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'summarize_llm' 
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
          transcript: sql<any>`
            (SELECT result_data->>'transcript' 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'transcribe_whisper' 
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
          summaryStatus: sql<string>`
            CASE 
              WHEN EXISTS (
                SELECT 1 FROM ${mlResults} 
                WHERE share_id = ${shares.id} 
                AND task_type = 'summarize_llm' 
                AND result_data->>'status' = 'success'
              ) THEN 'done'
              WHEN EXISTS (
                SELECT 1 FROM ${mlResults} 
                WHERE share_id = ${shares.id} 
                AND task_type = 'summarize_llm' 
                AND result_data->>'status' = 'failed'
              ) THEN 'failed'
              WHEN ${shares.status} = 'processing' THEN 'processing'
              WHEN ${shares.mediaType} IN ('video', 'audio') THEN 'pending'
              ELSE 'not_applicable'
            END
          `,
          transcriptStatus: sql<string>`
            CASE 
              WHEN EXISTS (
                SELECT 1 FROM ${mlResults} 
                WHERE share_id = ${shares.id} 
                AND task_type = 'transcribe_whisper' 
                AND result_data->>'status' = 'success'
              ) THEN 'done'
              WHEN EXISTS (
                SELECT 1 FROM ${mlResults} 
                WHERE share_id = ${shares.id} 
                AND task_type = 'transcribe_whisper' 
                AND result_data->>'status' = 'failed'
              ) THEN 'failed'
              WHEN ${shares.status} = 'processing' THEN 'processing'
              WHEN ${shares.mediaType} IN ('video', 'audio') THEN 'pending'
              ELSE 'not_applicable'
            END
          `,
          embeddingsStatus: sql<string>`
            CASE 
              WHEN EXISTS (
                SELECT 1 FROM ${mlResults} 
                WHERE share_id = ${shares.id} 
                AND task_type = 'embed_vectors'
              ) THEN 'done'
              WHEN ${shares.status} = 'done' THEN 'pending'
              ELSE 'not_applicable'
            END
          `,
          keyPoints: sql<string[]>`
            (SELECT result_data->'keyPoints' 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'summarize_llm' 
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
          language: sql<string>`
            (SELECT result_data->>'language' 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'transcribe_whisper' 
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
          duration: sql<number>`
            (SELECT (result_data->>'duration')::float 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'transcribe_whisper' 
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
          summaryProcessedAt: sql<string>`
            (SELECT created_at::text 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'summarize_llm' 
             AND result_data->>'status' = 'success'
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
          transcriptProcessedAt: sql<string>`
            (SELECT created_at::text 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'transcribe_whisper' 
             AND result_data->>'status' = 'success'
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
          summaryError: sql<string>`
            (SELECT result_data->>'error' 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'summarize_llm' 
             AND result_data->>'status' = 'failed'
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
          transcriptError: sql<string>`
            (SELECT result_data->>'error' 
             FROM ${mlResults} 
             WHERE share_id = ${shares.id} 
             AND task_type = 'transcribe_whisper' 
             AND result_data->>'status' = 'failed'
             ORDER BY created_at DESC 
             LIMIT 1)
          `,
        }
      })
      .from(shares)
      .where(and(eq(shares.id, id), eq(shares.userId, userId)))
      .limit(1);

    return results[0] || null;
  }
}