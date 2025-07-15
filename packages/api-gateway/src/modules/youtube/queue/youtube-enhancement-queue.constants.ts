/**
 * Queue constants for YouTube enhancement processing
 * Implements Phase 2 background processing as defined in ADR-213
 */
export const YOUTUBE_ENHANCEMENT_QUEUE = {
  NAME: 'youtube.enhance',
  
  // Job types for Phase 2 processing
  JOBS: {
    ENHANCE_CONTENT: 'youtube.enhance.content',
    DOWNLOAD_VIDEO: 'youtube.enhance.download',
    EXTRACT_CHAPTERS: 'youtube.enhance.chapters',
    GENERATE_TRANSCRIPT: 'youtube.enhance.transcript',
    EXTRACT_COMMENTS: 'youtube.enhance.comments',
    GENERATE_SUMMARY: 'youtube.enhance.summary',
    UPDATE_METADATA: 'youtube.enhance.metadata',
  },
  
  // Job priorities aligned with ADR-213
  PRIORITIES: {
    SHORT: 8,          // YouTube Shorts (highest priority)
    EDUCATIONAL: 6,    // Educational content
    STANDARD: 5,       // Standard videos (default)
    LONG: 4,          // Long videos (>10 min)
    MUSIC: 3,         // Music content (lowest priority)
    RETRY: 2,         // Retry jobs (lower priority)
  },
  
  // Processing timeouts per content type
  TIMEOUTS: {
    SHORT: 30000,      // 30 seconds
    STANDARD: 90000,   // 90 seconds
    LONG: 180000,      // 3 minutes
    EDUCATIONAL: 180000, // 3 minutes
    MUSIC: 10000,      // 10 seconds (metadata only)
    DOWNLOAD: 300000,   // 5 minutes for video download
    TRANSCRIPT: 120000, // 2 minutes for transcript generation
  },
  
  // Default queue options
  DEFAULT_OPTIONS: {
    removeOnComplete: {
      age: 3600,    // 1 hour
      count: 100,   // Keep last 100 completed jobs
    },
    removeOnFail: {
      age: 86400,   // 24 hours
      count: 500,   // Keep last 500 failed jobs
    },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    // Stack trace limit for debugging
    stackTraceLimit: 10,
  },
  
  // Content type thresholds
  CONTENT_THRESHOLDS: {
    SHORT_DURATION: 60,        // 60 seconds max for shorts
    LONG_DURATION: 600,        // 10 minutes threshold for long videos
    MAX_COMMENTS: 100,         // Max comments to process
    MAX_TRANSCRIPT_LENGTH: 50000, // Max transcript chars
  },
  
  // Rate limits for YouTube API
  RATE_LIMITS: {
    API_CALLS_PER_MINUTE: 30,
    DOWNLOADS_PER_MINUTE: 5,
    RETRY_DELAY: 60000,        // 1 minute retry delay
  },
  
  // Job status events
  EVENTS: {
    STARTED: 'youtube.enhance.started',
    PROGRESS: 'youtube.enhance.progress',
    COMPLETED: 'youtube.enhance.completed',
    FAILED: 'youtube.enhance.failed',
    RETRYING: 'youtube.enhance.retrying',
  },
  
  // Progress tracking stages
  PROGRESS_STAGES: {
    METADATA: 10,
    DOWNLOAD: 30,
    CHAPTERS: 40,
    TRANSCRIPT: 60,
    COMMENTS: 80,
    SUMMARY: 90,
    COMPLETE: 100,
  },
  
  // Error types for retry logic
  ERROR_TYPES: {
    RATE_LIMIT: 'RATE_LIMIT',
    NETWORK: 'NETWORK_ERROR',
    INVALID_VIDEO: 'INVALID_VIDEO',
    PROCESSING: 'PROCESSING_ERROR',
    TEMPORARY: 'TEMPORARY_ERROR',
  },
  
  // Retry strategies per error type
  RETRY_STRATEGIES: {
    RATE_LIMIT: {
      attempts: 5,
      delay: 60000,    // 1 minute
      maxDelay: 300000, // 5 minutes
    },
    NETWORK: {
      attempts: 3,
      delay: 5000,     // 5 seconds
      maxDelay: 30000, // 30 seconds
    },
    TEMPORARY: {
      attempts: 3,
      delay: 10000,    // 10 seconds
      maxDelay: 60000, // 1 minute
    },
  },
};