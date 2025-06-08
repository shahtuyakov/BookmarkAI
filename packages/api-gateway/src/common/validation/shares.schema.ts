import { z } from 'zod';
import { PaginationSchema, SortSchema, FieldsSchema, DateRangeSchema } from './pagination.schema';

/**
 * Share validation schemas following ADR-012 conventions
 */

// Supported platforms
export const PlatformSchema = z.enum(['tiktok', 'reddit', 'twitter', 'x', 'unknown']);

// Share status
export const ShareStatusSchema = z.enum(['pending', 'processing', 'done', 'failed']);

// Supported URL patterns
const URL_PATTERNS = {
  tiktok: /^https?:\/\/(www\.)?tiktok\.com\/@[^/]+\/video\/\d+/,
  reddit: /^https?:\/\/(www\.)?reddit\.com\/r\/[^/]+\/comments\/[^/]+/,
  twitter: /^https?:\/\/(www\.)?twitter\.com\/[^/]+\/status\/\d+/,
  x: /^https?:\/\/(www\.)?x\.com\/[^/]+\/status\/\d+/,
};

// URL validation with platform detection
export const ShareUrlSchema = z
  .string()
  .url('Must be a valid URL')
  .refine(
    url => {
      return Object.values(URL_PATTERNS).some(pattern => pattern.test(url));
    },
    {
      message: 'URL must be from a supported platform: tiktok.com, reddit.com, twitter.com, x.com',
    },
  );

// Create share request
export const CreateShareSchema = z.object({
  url: ShareUrlSchema,
  title: z.string().trim().max(200, 'Title cannot exceed 200 characters').optional(),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').optional(),
});

// Batch operation item
export const BatchShareItemSchema = z.object({
  url: ShareUrlSchema,
  idempotencyKey: z.string().uuid('Idempotency key must be a valid UUID'),
  title: z.string().trim().max(200, 'Title cannot exceed 200 characters').optional(),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').optional(),
});

// Create shares batch request
export const CreateSharesBatchSchema = z.object({
  operations: z
    .array(BatchShareItemSchema)
    .min(1, 'At least one operation is required')
    .max(50, 'Cannot process more than 50 operations in a batch')
    .refine(
      operations => {
        const keys = operations.map(op => op.idempotencyKey);
        return new Set(keys).size === keys.length;
      },
      {
        message: 'All idempotency keys must be unique within the batch',
      },
    ),
});

// Share list query parameters
export const ShareListQuerySchema = PaginationSchema.merge(DateRangeSchema).extend({
  status: ShareStatusSchema.optional(),
  platform: z
    .union([
      PlatformSchema,
      z
        .string()
        .transform(str => str.split(',').map(s => s.trim()))
        .pipe(z.array(PlatformSchema)),
    ])
    .optional(),
  sort: SortSchema.refine(
    sort => {
      if (!sort) return true;
      const allowedFields = ['createdAt', 'platform', 'status', 'updatedAt'];
      const fields = sort.split(',').map(field => field.replace(/^-/, ''));
      return fields.every(field => allowedFields.includes(field));
    },
    {
      message: 'Sort fields must be one of: createdAt, platform, status, updatedAt',
    },
  ),
  fields: FieldsSchema.refine(
    fields => {
      if (!fields) return true;
      const allowedFields = [
        'id',
        'url',
        'title',
        'notes',
        'status',
        'platform',
        'userId',
        'metadata',
        'createdAt',
        'updatedAt',
        'processedAt',
      ];
      return fields.every(field => allowedFields.includes(field));
    },
    {
      message:
        'Fields must be one of: id, url, title, notes, status, platform, userId, metadata, createdAt, updatedAt, processedAt',
    },
  ),
});

// Share detail query parameters
export const ShareDetailQuerySchema = z.object({
  fields: FieldsSchema.refine(
    fields => {
      if (!fields) return true;
      const allowedFields = [
        'id',
        'url',
        'title',
        'notes',
        'status',
        'platform',
        'userId',
        'metadata',
        'createdAt',
        'updatedAt',
        'processedAt',
      ];
      return fields.every(field => allowedFields.includes(field));
    },
    {
      message:
        'Fields must be one of: id, url, title, notes, status, platform, userId, metadata, createdAt, updatedAt, processedAt',
    },
  ),
});

// UUID parameter validation
export const UuidParamSchema = z.object({
  shareId: z.string().uuid('Share ID must be a valid UUID'),
});

// Types
export type Platform = z.infer<typeof PlatformSchema>;
export type ShareStatus = z.infer<typeof ShareStatusSchema>;
export type CreateShareRequest = z.infer<typeof CreateShareSchema>;
export type BatchShareItem = z.infer<typeof BatchShareItemSchema>;
export type CreateSharesBatchRequest = z.infer<typeof CreateSharesBatchSchema>;
export type ShareListQuery = z.infer<typeof ShareListQuerySchema>;
export type ShareDetailQuery = z.infer<typeof ShareDetailQuerySchema>;
export type ShareParams = z.infer<typeof UuidParamSchema>;

/**
 * Helper to detect platform from URL
 */
export function detectPlatform(url: string): Platform {
  for (const [platform, pattern] of Object.entries(URL_PATTERNS)) {
    if (pattern.test(url)) {
      return platform as Platform;
    }
  }
  return 'unknown';
}

/**
 * Helper to validate idempotency key format
 */
export const IdempotencyKeySchema = z.string().uuid('Idempotency key must be a valid UUID');

/**
 * Helper to validate request ID format
 */
export const RequestIdSchema = z.string().uuid('Request ID must be a valid UUID').optional();
