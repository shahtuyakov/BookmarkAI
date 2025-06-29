import { Injectable, Logger } from '@nestjs/common';
import { and, between, desc, eq, gte, sql } from 'drizzle-orm';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { mlResults } from '../../../db/schema/ml-results';

export interface CostSummaryDto {
  periodHours: number;
  totalCostUsd: number;
  totalDurationSeconds: number;
  totalDurationHours: number;
  transcriptionCount: number;
  avgCostPerTranscription: number;
  avgDurationSeconds: number;
  costPerHour: number;
  breakdown?: {
    api: number;
    local: number;
  };
}

export interface TranscriptionCostDto {
  shareId: string;
  audioDurationSeconds: number;
  billingUsd: number;
  backend: string;
  createdAt: Date;
}

export interface MLResultSummaryDto {
  taskType: string;
  count: number;
  avgProcessingMs: number;
  totalProcessingMs: number;
  lastProcessedAt: Date;
}

@Injectable()
export class MLAnalyticsService {
  private readonly logger = new Logger(MLAnalyticsService.name);

  constructor(private readonly drizzleService: DrizzleService) {}

  /**
   * Get transcription cost summary for a specified time period
   */
  async getTranscriptionCostSummary(hours: number = 24): Promise<CostSummaryDto> {
    try {
      const db = this.drizzleService.database;
      const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

      // Query transcription costs from ml_results
      const results = await db
        .select({
          count: sql<number>`COUNT(*)`,
          totalDuration: sql<number>`COALESCE(SUM((result_data->>'duration_seconds')::numeric), 0)`,
          totalCost: sql<number>`COALESCE(SUM((result_data->>'billing_usd')::numeric), 0)`,
          avgDuration: sql<number>`COALESCE(AVG((result_data->>'duration_seconds')::numeric), 0)`,
          avgCost: sql<number>`COALESCE(AVG((result_data->>'billing_usd')::numeric), 0)`,
          apiCount: sql<number>`COUNT(*) FILTER (WHERE result_data->>'backend' = 'api')`,
          apiCost: sql<number>`COALESCE(SUM((result_data->>'billing_usd')::numeric) FILTER (WHERE result_data->>'backend' = 'api'), 0)`,
          localCount: sql<number>`COUNT(*) FILTER (WHERE result_data->>'backend' = 'local')`,
          localCost: sql<number>`COALESCE(SUM((result_data->>'billing_usd')::numeric) FILTER (WHERE result_data->>'backend' = 'local'), 0)`,
        })
        .from(mlResults)
        .where(
          and(
            eq(mlResults.taskType, 'transcription'),
            gte(mlResults.createdAt, startDate)
          )
        );

      const result = results[0];
      const totalDurationHours = result.totalDuration / 3600;

      return {
        periodHours: hours,
        totalCostUsd: result.totalCost,
        totalDurationSeconds: result.totalDuration,
        totalDurationHours,
        transcriptionCount: result.count,
        avgCostPerTranscription: result.avgCost,
        avgDurationSeconds: result.avgDuration,
        costPerHour: totalDurationHours > 0 ? result.totalCost / totalDurationHours : 0,
        breakdown: {
          api: result.apiCost,
          local: result.localCost,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get transcription cost summary: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get detailed transcription costs for a specific time period
   */
  async getDetailedTranscriptionCosts(
    hours: number = 24,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ costs: TranscriptionCostDto[]; total: number }> {
    try {
      const db = this.drizzleService.database;
      const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(mlResults)
        .where(
          and(
            eq(mlResults.taskType, 'transcription'),
            gte(mlResults.createdAt, startDate)
          )
        );

      // Get detailed costs
      const results = await db
        .select({
          shareId: mlResults.shareId,
          resultData: mlResults.resultData,
          createdAt: mlResults.createdAt,
        })
        .from(mlResults)
        .where(
          and(
            eq(mlResults.taskType, 'transcription'),
            gte(mlResults.createdAt, startDate)
          )
        )
        .orderBy(desc(mlResults.createdAt))
        .limit(limit)
        .offset(offset);

      const costs: TranscriptionCostDto[] = results.map((row) => {
        const data = row.resultData as any;
        return {
          shareId: row.shareId,
          audioDurationSeconds: data?.duration_seconds || 0,
          billingUsd: data?.billing_usd || 0,
          backend: data?.backend || 'unknown',
          createdAt: row.createdAt,
        };
      });

      return {
        costs,
        total: countResult[0].count,
      };
    } catch (error) {
      this.logger.error(`Failed to get detailed transcription costs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get ML task summary across all task types
   */
  async getMLTaskSummary(hours: number = 24): Promise<MLResultSummaryDto[]> {
    try {
      const db = this.drizzleService.database;
      const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

      const results = await db
        .select({
          taskType: mlResults.taskType,
          count: sql<number>`COUNT(*)`,
          avgProcessingMs: sql<number>`COALESCE(AVG(processing_ms), 0)`,
          totalProcessingMs: sql<number>`COALESCE(SUM(processing_ms), 0)`,
          lastProcessedAt: sql<Date>`MAX(created_at)`,
        })
        .from(mlResults)
        .where(gte(mlResults.createdAt, startDate))
        .groupBy(mlResults.taskType);

      return results.map((row) => ({
        taskType: row.taskType,
        count: row.count,
        avgProcessingMs: row.avgProcessingMs,
        totalProcessingMs: row.totalProcessingMs,
        lastProcessedAt: row.lastProcessedAt,
      }));
    } catch (error) {
      this.logger.error(`Failed to get ML task summary: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current budget status
   */
  async getBudgetStatus(): Promise<{
    hourly: { used: number; limit: number; remaining: number; percentUsed: number };
    daily: { used: number; limit: number; remaining: number; percentUsed: number };
  }> {
    try {
      // Get limits from environment (these would normally come from config service)
      const hourlyLimit = parseFloat(process.env.WHISPER_HOURLY_COST_LIMIT || '1.00');
      const dailyLimit = parseFloat(process.env.WHISPER_DAILY_COST_LIMIT || '10.00');

      // Get current usage
      const hourlyCosts = await this.getTranscriptionCostSummary(1);
      const dailyCosts = await this.getTranscriptionCostSummary(24);

      return {
        hourly: {
          used: hourlyCosts.totalCostUsd,
          limit: hourlyLimit,
          remaining: Math.max(0, hourlyLimit - hourlyCosts.totalCostUsd),
          percentUsed: hourlyLimit > 0 ? (hourlyCosts.totalCostUsd / hourlyLimit) * 100 : 0,
        },
        daily: {
          used: dailyCosts.totalCostUsd,
          limit: dailyLimit,
          remaining: Math.max(0, dailyLimit - dailyCosts.totalCostUsd),
          percentUsed: dailyLimit > 0 ? (dailyCosts.totalCostUsd / dailyLimit) * 100 : 0,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get budget status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get transcription result for a specific share
   */
  async getTranscriptionResult(shareId: string): Promise<any> {
    try {
      const db = this.drizzleService.database;
      
      const result = await db
        .select()
        .from(mlResults)
        .where(
          and(
            eq(mlResults.shareId, shareId),
            eq(mlResults.taskType, 'transcription')
          )
        )
        .orderBy(desc(mlResults.createdAt))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      const data = result[0].resultData as any;
      return {
        id: result[0].id,
        shareId: result[0].shareId,
        modelVersion: result[0].modelVersion,
        processingMs: result[0].processingMs,
        createdAt: result[0].createdAt,
        ...(data || {}),
      };
    } catch (error) {
      this.logger.error(`Failed to get transcription result: ${error.message}`);
      throw error;
    }
  }
}