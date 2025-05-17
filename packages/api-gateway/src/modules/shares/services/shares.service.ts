import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { IdempotencyService } from './idempotency.service';
import { CreateShareDto } from '../dto/create-share.dto';
import { ShareDto } from '../dto/share.dto';
import { GetSharesQueryDto } from '../dto/get-shares-query.dto';
import { PaginatedData } from '../interfaces/paginated-data.interface';
import { ApiResponse, successResponse, errorResponse } from '../interfaces/api-response.interface';
import { detectPlatform, Platform } from '../constants/platform.enum';
import { ShareStatus } from '../constants/share-status.enum';
import { ERROR_CODES } from '../constants/error-codes.constant';
import { SHARE_QUEUE } from '../queue/share-queue.constants';
import { eq, and, desc, lt, gte, sql } from 'drizzle-orm';
import { shares } from '../../../db/schema/shares';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ErrorService } from './error.service';

/**
 * Service for managing share operations
 */
@Injectable()
export class SharesService {
  private readonly logger = new Logger(SharesService.name);

  constructor(
    private readonly db: DrizzleService,
    private readonly idempotencyService: IdempotencyService,
    @InjectQueue(SHARE_QUEUE.NAME) private readonly shareQueue: Queue
  ) {}

  /**
   * Create a new share
   */
  async createShare(
    createShareDto: CreateShareDto, 
    userId: string, 
    idempotencyKey?: string
  ): Promise<ApiResponse<ShareDto>> {
    try {
      // Validate idempotency key
      ErrorService.validateIdempotencyKey(idempotencyKey);

      // Check for existing idempotent request
      const existingResponse = await this.idempotencyService.checkIdempotentRequest(
        userId,
        idempotencyKey
      );

      if (existingResponse) {
        // Return the stored response if this is a duplicate request
        this.logger.log(`Returning cached response for idempotency key: ${idempotencyKey}`);
        return JSON.parse(existingResponse);
      }

      // Validate URL
      ErrorService.validateUrl(createShareDto.url);

      // Detect platform from URL
      const platform = detectPlatform(createShareDto.url);
      
      // Reject unsupported platforms (should be caught by URL validation, but double-check)
      if (platform === Platform.UNKNOWN) {
        ErrorService.throwError(ERROR_CODES.UNSUPPORTED_PLATFORM);
      }

      // Create the share
      try {
        const [newShare] = await this.db.database
          .insert(shares)
          .values({
            userId,
            url: createShareDto.url,
            platform,
            status: ShareStatus.PENDING,
            idempotencyKey,
          })
          .returning();

        // Queue background processing job
        await this.shareQueue.add(
          SHARE_QUEUE.JOBS.PROCESS,
          { shareId: newShare.id },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
        );

        // Map to DTO for response
        const shareDto: ShareDto = {
          id: newShare.id,
          url: newShare.url,
          platform: newShare.platform as Platform,
          status: newShare.status as ShareStatus,
          createdAt: newShare.createdAt,
          updatedAt: newShare.updatedAt,
        };

        // Create success response
        const response = successResponse(shareDto);
        
        // Store for idempotency
        await this.idempotencyService.storeResponse(
          userId,
          idempotencyKey,
          JSON.stringify(response)
        );
        
        return response;
      } catch (error) {
        // Check for unique constraint violations
        if (error.code === '23505') {
          if (error.constraint === 'idx_shares_url_user_id') {
            // Handle duplicate URL for same user
            const existingShares = await this.db.database
              .select()
              .from(shares)
              .where(
                and(
                  eq(shares.userId, userId),
                  eq(shares.url, createShareDto.url)
                )
              )
              .limit(1);

            if (existingShares.length > 0) {
              const existingShare = existingShares[0];
              
              const shareDto: ShareDto = {
                id: existingShare.id,
                url: existingShare.url,
                platform: existingShare.platform as Platform,
                status: existingShare.status as ShareStatus,
                createdAt: existingShare.createdAt,
                updatedAt: existingShare.updatedAt,
              };
              
              const response = successResponse(shareDto);
              
              // Store for idempotency
              await this.idempotencyService.storeResponse(
                userId,
                idempotencyKey,
                JSON.stringify(response)
              );
              
              return response;
            }
          }
          
          // Let the error service handle other constraint violations
          ErrorService.handleDatabaseError(error);
        }
        
        // Rethrow other errors
        throw error;
      }
    } catch (error) {
      this.logger.error(`Error creating share: ${error.message}`, error.stack);
      
      // If the error is already a HTTP exception from the ErrorService, just rethrow it
      if (error instanceof BadRequestException || 
          error instanceof ConflictException || 
          error instanceof NotFoundException) {
        throw error;
      }
      
      // For database errors, use our specialized handler
      if (error.code && typeof error.code === 'string') {
        ErrorService.handleDatabaseError(error);
      }
      
      // For unhandled errors, throw a generic server error
      ErrorService.throwError(
        ERROR_CODES.SERVER_ERROR,
        'Failed to create share'
      );
    }
  }
  
  /**
   * Get a paginated list of shares for a user
   */
  async getShares(
    userId: string, 
    query: GetSharesQueryDto
  ): Promise<ApiResponse<PaginatedData<ShareDto>>> {
    try {
      // Default limit
      const limit = query.limit || 20;
      
      // Build filters
      let filters = eq(shares.userId, userId);
      
      // Parse cursor if provided
      if (query.cursor) {
        try {
          // Cursor format: {timestamp}_{id}
          const [timestamp, id] = query.cursor.split('_');
          const cursorDate = new Date(timestamp);
          
          if (isNaN(cursorDate.getTime())) {
            throw new Error('Invalid cursor timestamp');
          }
          
          // Filter for items older than the cursor
          const cursorCondition = sql`(${shares.createdAt}, ${shares.id}) < (${cursorDate}, ${id})`;
          
          // Add cursor filter to the existing filters
          filters = and(filters, cursorCondition);
        } catch (error) {
          this.logger.warn(`Invalid cursor format: ${query.cursor}`);
          // Invalid cursor, ignore it
        }
      }
      
      // Add platform filter if specified
      if (query.platform) {
        filters = and(filters, eq(shares.platform, query.platform));
      }
      
      // Add status filter if specified
      if (query.status) {
        filters = and(filters, eq(shares.status, query.status));
      }
      
      // Query shares
      const results = await this.db.database
        .select()
        .from(shares)
        .where(filters)
        .orderBy(desc(shares.createdAt), desc(shares.id))
        .limit(limit + 1); // Fetch one extra to determine if there are more
      
      // Check if there are more items
      const hasMore = results.length > limit;
      const items = results.slice(0, limit); // Remove the extra item
      
      // Generate cursor for next page if there are more items
      let nextCursor = undefined;
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1];
        nextCursor = `${lastItem.createdAt.toISOString()}_${lastItem.id}`;
      }
      
      // Map to DTOs
      const shareDtos: ShareDto[] = items.map(item => ({
        id: item.id,
        url: item.url,
        platform: item.platform as Platform,
        status: item.status as ShareStatus,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
      
      return successResponse({
        items: shareDtos,
        cursor: nextCursor,
        hasMore,
        limit,
      });
    } catch (error) {
      this.logger.error(`Error getting shares: ${error.message}`, error.stack);
      throw new BadRequestException(
        errorResponse(
          ERROR_CODES.SERVER_ERROR,
          'Failed to get shares'
        )
      );
    }
  }
  
  /**
   * Get a specific share by ID
   */
  async getShareById(id: string, userId: string): Promise<ApiResponse<ShareDto>> {
    try {
      const [share] = await this.db.database
        .select()
        .from(shares)
        .where(
          and(
            eq(shares.id, id),
            eq(shares.userId, userId)
          )
        )
        .limit(1);
      
      if (!share) {
        ErrorService.throwError(ERROR_CODES.SHARE_NOT_FOUND);
      }
      
      const shareDto: ShareDto = {
        id: share.id,
        url: share.url,
        platform: share.platform as Platform,
        status: share.status as ShareStatus,
        createdAt: share.createdAt,
        updatedAt: share.updatedAt,
      };
      
      return successResponse(shareDto);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      this.logger.error(`Error getting share by ID: ${error.message}`, error.stack);
      
      // For database errors, use our specialized handler
      if (error.code && typeof error.code === 'string') {
        ErrorService.handleDatabaseError(error);
      }
      
      ErrorService.throwError(
        ERROR_CODES.SERVER_ERROR,
        'Failed to get share'
      );
    }
  }
}