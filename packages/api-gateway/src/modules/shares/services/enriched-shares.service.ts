import { Injectable, NotFoundException } from '@nestjs/common';
import { SharesRepository } from '../repositories/shares.repository';
import { GetEnrichedSharesQueryDto } from '../dto/get-enriched-shares-query.dto';
import { EnrichedShareDto, MLResultsDto, MLProcessingStatus, PaginatedEnrichedSharesDto } from '../dto/enriched-share.dto';
import { ApiResponse, successResponse, errorResponse } from '../interfaces/api-response.interface';
import { ErrorService } from '../services/error.service';
import { ERROR_CODES } from '../constants/error-codes.constant';
import { Platform } from '../constants/platform.enum';
import { ShareStatus } from '../constants/share-status.enum';

@Injectable()
export class EnrichedSharesService {
  constructor(
    private readonly sharesRepository: SharesRepository,
  ) {}

  /**
   * Get paginated list of enriched shares
   */
  async getEnrichedShares(
    userId: string,
    query: GetEnrichedSharesQueryDto,
  ): Promise<ApiResponse<PaginatedEnrichedSharesDto>> {
    try {
      const result = await this.sharesRepository.findEnrichedShares(userId, query);
      
      // Transform repository results to DTOs
      const enrichedShares: EnrichedShareDto[] = result.items.map(item => {
        const enrichedShare: EnrichedShareDto = {
          id: item.share.id,
          url: item.share.url,
          platform: item.share.platform as Platform,
          status: item.share.status as ShareStatus,
          title: item.share.title,
          description: item.share.description,
          author: item.share.author,
          thumbnailUrl: item.share.thumbnailUrl,
          mediaUrl: item.share.mediaUrl,
          mediaType: item.share.mediaType,
          platformData: item.share.platformData,
          createdAt: item.share.createdAt,
          updatedAt: item.share.updatedAt,
        };

        // Add ML results if available
        if (item.mlResults) {
          const mlResults: MLResultsDto = {
            summary: item.mlResults.summary || undefined,
            keyPoints: item.mlResults.keyPoints || undefined,
            transcript: item.mlResults.transcript || undefined,
            language: item.mlResults.language || undefined,
            duration: item.mlResults.duration || undefined,
            hasEmbeddings: item.mlResults.embeddingsStatus === 'done',
            processingStatus: {
              summary: item.mlResults.summaryStatus as MLProcessingStatus,
              transcript: item.mlResults.transcriptStatus as MLProcessingStatus,
              embeddings: item.mlResults.embeddingsStatus as MLProcessingStatus,
            },
          };

          enrichedShare.mlResults = mlResults;
        }

        return enrichedShare;
      });

      const response: PaginatedEnrichedSharesDto = {
        items: enrichedShares,
        cursor: result.cursor,
        hasMore: result.hasMore,
        limit: result.limit,
      };

      return successResponse(response);
    } catch (error) {
      ErrorService.throwError(ERROR_CODES.SERVER_ERROR, 'Failed to get enriched shares');
    }
  }

  /**
   * Get a single enriched share by ID
   */
  async getEnrichedShareById(
    shareId: string,
    userId: string,
  ): Promise<ApiResponse<EnrichedShareDto>> {
    try {
      const result = await this.sharesRepository.findEnrichedShareById(shareId, userId);
      
      if (!result) {
        throw new NotFoundException(
          errorResponse(ERROR_CODES.SHARE_NOT_FOUND, 'Share not found')
        );
      }

      // Transform to DTO
      const enrichedShare: EnrichedShareDto = {
        id: result.share.id,
        url: result.share.url,
        platform: result.share.platform as Platform,
        status: result.share.status as ShareStatus,
        title: result.share.title,
        description: result.share.description,
        author: result.share.author,
        thumbnailUrl: result.share.thumbnailUrl,
        mediaUrl: result.share.mediaUrl,
        mediaType: result.share.mediaType,
        platformData: result.share.platformData,
        createdAt: result.share.createdAt,
        updatedAt: result.share.updatedAt,
      };

      // Add ML results if available
      if (result.mlResults) {
        const mlResults: MLResultsDto = {
          summary: result.mlResults.summary || undefined,
          keyPoints: result.mlResults.keyPoints || undefined,
          transcript: result.mlResults.transcript || undefined,
          language: result.mlResults.language || undefined,
          duration: result.mlResults.duration || undefined,
          hasEmbeddings: result.mlResults.embeddingsStatus === 'done',
          processingStatus: {
            summary: result.mlResults.summaryStatus as MLProcessingStatus,
            transcript: result.mlResults.transcriptStatus as MLProcessingStatus,
            embeddings: result.mlResults.embeddingsStatus as MLProcessingStatus,
          },
          processedAt: {
            summary: result.mlResults.summaryProcessedAt || undefined,
            transcript: result.mlResults.transcriptProcessedAt || undefined,
          },
          error: {
            summary: result.mlResults.summaryError || undefined,
            transcript: result.mlResults.transcriptError || undefined,
          },
        };

        // Clean up undefined values in nested objects
        if (!mlResults.processedAt?.summary && !mlResults.processedAt?.transcript) {
          delete mlResults.processedAt;
        }
        if (!mlResults.error?.summary && !mlResults.error?.transcript) {
          delete mlResults.error;
        }

        enrichedShare.mlResults = mlResults;
      }

      return successResponse(enrichedShare);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      ErrorService.throwError(ERROR_CODES.SERVER_ERROR, 'Failed to get enriched share');
    }
  }
}