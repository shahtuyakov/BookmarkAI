import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { CreateShareDto } from '../dto/create-share.dto';
import { ShareDto } from '../dto/share.dto';
import { GetSharesQueryDto } from '../dto/get-shares-query.dto';
import { PaginatedData } from '../interfaces/paginated-data.interface';
import { ApiResponse, successResponse, errorResponse } from '../interfaces/api-response.interface';
import { detectPlatform, Platform } from '../constants/platform.enum';
import { ShareStatus } from '../constants/share-status.enum';
import { ERROR_CODES } from '../constants/error-codes.constant';
import { SHARE_QUEUE } from '../queue/share-queue.constants';
import { IdempotencyService } from './idempotency.service';
import { ErrorService } from './error.service';
import { ContentFetcherRegistry } from '../fetchers/content-fetcher.registry';
import { SharesRepository } from '../repositories/shares.repository';

/**
 * Service for managing share operations
 */
@Injectable()
export class SharesService {
  private readonly logger = new Logger(SharesService.name);

  constructor(
    private readonly sharesRepository: SharesRepository,
    private readonly idempotencyService: IdempotencyService,
    @InjectQueue(SHARE_QUEUE.NAME) private readonly shareQueue: Queue,
    private readonly fetcherRegistry: ContentFetcherRegistry,
  ) {}

  /**
   * Create a new share
   */
  async createShare(
    createShareDto: CreateShareDto,
    userId: string,
    idempotencyKey?: string,
  ): Promise<ApiResponse<ShareDto>> {
    try {
      // Validate idempotency key
      ErrorService.validateIdempotencyKey(idempotencyKey);

      // Check for existing idempotent request (with fingerprinting fallback)
      const existingResponse = await this.idempotencyService.checkIdempotentRequest(
        userId,
        idempotencyKey,
        createShareDto,
        '/v1/shares',
      );

      if (existingResponse) {
        const parsed = this.idempotencyService.parseStoredResponse(existingResponse);

        if (parsed.isProcessing) {
          // Request is still processing, return 202 with processing status
          this.logger.log(`Request still processing for idempotency key: ${idempotencyKey}`);
          return successResponse({ status: 'processing' } as any);
        } else {
          // Return the cached completed response
          this.logger.log(`Returning cached response for idempotency key: ${idempotencyKey}`);
          return parsed.response;
        }
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
        const newShare = await this.sharesRepository.create({
          userId,
          url: createShareDto.url,
          platform,
          status: ShareStatus.PENDING,
          idempotencyKey,
        });

        // Get rate limit configuration for the platform
        const rateLimitConfig = this.fetcherRegistry.getRateLimitConfig(platform);
        
        // Queue background processing job
        // Note: BullMQ rate limiting is handled at the worker level, not job level
        await this.shareQueue.add(
          SHARE_QUEUE.JOBS.PROCESS,
          { shareId: newShare.id },
          { 
            attempts: 3, 
            backoff: { type: 'exponential', delay: 5000 },
            // TODO: Implement rate limiting at worker level or use a different approach
            // Rate limit config: max: ${rateLimitConfig.max}, duration: ${rateLimitConfig.duration}ms
          },
        );

        // Map to DTO for response
        const shareDto: ShareDto = {
          id: newShare.id,
          url: newShare.url,
          platform: newShare.platform as Platform,
          status: newShare.status as ShareStatus,
          title: newShare.title,
          description: newShare.description,
          author: newShare.author,
          thumbnailUrl: newShare.thumbnailUrl,
          mediaUrl: newShare.mediaUrl,
          mediaType: newShare.mediaType,
          platformData: newShare.platformData,
          createdAt: newShare.createdAt,
          updatedAt: newShare.updatedAt,
        };

        // Create success response
        const response = successResponse(shareDto);

        // Store for idempotency
        await this.idempotencyService.storeResponse(userId, idempotencyKey, response, 201);

        // Also store fingerprint response for content-based deduplication
        await this.idempotencyService.storeFingerprintResponse(
          userId,
          createShareDto,
          '/v1/shares',
          response,
        );

        return response;
      } catch (error) {
        // Check for unique constraint violations
        if (error.code === '23505') {
          if (error.constraint === 'idx_shares_url_user_id') {
            // Handle duplicate URL for same user
            const existingShares = await this.sharesRepository.findByUrlAndUserId(
              createShareDto.url,
              userId,
            );

            if (existingShares.length > 0) {
              const existingShare = existingShares[0];

              const shareDto: ShareDto = {
                id: existingShare.id,
                url: existingShare.url,
                platform: existingShare.platform as Platform,
                status: existingShare.status as ShareStatus,
                title: existingShare.title,
                description: existingShare.description,
                author: existingShare.author,
                thumbnailUrl: existingShare.thumbnailUrl,
                mediaUrl: existingShare.mediaUrl,
                mediaType: existingShare.mediaType,
                platformData: existingShare.platformData,
                createdAt: existingShare.createdAt,
                updatedAt: existingShare.updatedAt,
              };

              const response = successResponse(shareDto);

              // Store for idempotency
              await this.idempotencyService.storeResponse(
                userId,
                idempotencyKey,
                JSON.stringify(response),
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
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      // For database errors, use our specialized handler
      if (error.code && typeof error.code === 'string') {
        ErrorService.handleDatabaseError(error);
      }

      // For unhandled errors, throw a generic server error
      ErrorService.throwError(ERROR_CODES.SERVER_ERROR, 'Failed to create share');
    }
  }

  /**
   * Get a paginated list of shares for a user
   */
  async getShares(
    userId: string,
    query: GetSharesQueryDto,
  ): Promise<ApiResponse<PaginatedData<ShareDto>>> {
    try {
      // Default limit
      const limit = query.limit || 20;

      // Build filters
      const filters: any = {
        userId,
      };

      if (query.platform) {
        filters.platform = query.platform;
      }

      if (query.status) {
        filters.status = query.status;
      }

      // Query shares using repository
      const result = await this.sharesRepository.findWithFilters(filters, {
        limit,
        cursor: query.cursor,
        orderBy: 'createdAt',
        orderDirection: 'desc',
      });

      const { items, hasMore, cursor: nextCursor } = result;

      // Map to DTOs
      const shareDtos: ShareDto[] = items.map(item => ({
        id: item.id,
        url: item.url,
        platform: item.platform as Platform,
        status: item.status as ShareStatus,
        title: item.title,
        description: item.description,
        author: item.author,
        thumbnailUrl: item.thumbnailUrl,
        mediaUrl: item.mediaUrl,
        mediaType: item.mediaType,
        platformData: item.platformData,
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
        errorResponse(ERROR_CODES.SERVER_ERROR, 'Failed to get shares'),
      );
    }
  }

  /**
   * Get a specific share by ID
   */
  async getShareById(id: string, userId: string): Promise<ApiResponse<ShareDto>> {
    try {
      const share = await this.sharesRepository.findByIdAndUserId(id, userId);

      if (!share) {
        ErrorService.throwError(ERROR_CODES.SHARE_NOT_FOUND);
      }

      const shareDto: ShareDto = {
        id: share.id,
        url: share.url,
        platform: share.platform as Platform,
        status: share.status as ShareStatus,
        title: share.title,
        description: share.description,
        author: share.author,
        thumbnailUrl: share.thumbnailUrl,
        mediaUrl: share.mediaUrl,
        mediaType: share.mediaType,
        platformData: share.platformData,
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

      ErrorService.throwError(ERROR_CODES.SERVER_ERROR, 'Failed to get share');
    }
  }
}
