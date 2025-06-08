import { z } from 'zod';

/**
 * Pagination schemas following ADR-012 conventions
 */

// Base pagination schema
export const PaginationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(20),
  cursor: z.string().optional(),
});

// Offset-based pagination (for admin/search endpoints only)
export const OffsetPaginationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(20),
  offset: z.coerce.number().int().min(0, 'Offset must be non-negative').default(0),
});

// Sorting schema
export const SortSchema = z
  .string()
  .regex(
    /^-?[a-zA-Z][a-zA-Z0-9_]*(?:,-?[a-zA-Z][a-zA-Z0-9_]*)*$/,
    'Sort must be comma-separated field names, optionally prefixed with - for descending',
  )
  .optional();

// Field selection schema
export const FieldsSchema = z
  .string()
  .transform(fields =>
    fields
      .split(',')
      .map(f => f.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Invalid field name'))
      .min(1, 'At least one field must be specified'),
  )
  .optional();

// Date range filtering
export const DateRangeSchema = z
  .object({
    createdAfter: z.coerce.date().optional(),
    createdBefore: z.coerce.date().optional(),
  })
  .refine(
    data => !data.createdAfter || !data.createdBefore || data.createdAfter <= data.createdBefore,
    {
      message: 'createdAfter must be before or equal to createdBefore',
      path: ['createdAfter'],
    },
  );

// Cursor format validation
export const CursorSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-zA-Z0-9-_]+$/,
    'Cursor must be in format: YYYY-MM-DDTHH:mm:ss.sssZ_id',
  )
  .optional();

// Types
export type PaginationQuery = z.infer<typeof PaginationSchema>;
export type OffsetPaginationQuery = z.infer<typeof OffsetPaginationSchema>;
export type SortQuery = z.infer<typeof SortSchema>;
export type FieldsQuery = z.infer<typeof FieldsSchema>;
export type DateRangeQuery = z.infer<typeof DateRangeSchema>;

/**
 * Helper to parse sort string into structured format
 */
export function parseSortQuery(sort?: string): Array<{ field: string; direction: 'asc' | 'desc' }> {
  if (!sort) return [];

  return sort.split(',').map(item => {
    const trimmed = item.trim();
    if (trimmed.startsWith('-')) {
      return { field: trimmed.slice(1), direction: 'desc' as const };
    }
    return { field: trimmed, direction: 'asc' as const };
  });
}

/**
 * Helper to create cursor from timestamp and ID
 */
export function createCursor(timestamp: Date, id: string): string {
  return `${timestamp.toISOString()}_${id}`;
}

/**
 * Helper to parse cursor into timestamp and ID
 */
export function parseCursor(cursor: string): { timestamp: Date; id: string } | null {
  try {
    const [timestampStr, id] = cursor.split('_');
    const timestamp = new Date(timestampStr);

    if (isNaN(timestamp.getTime()) || !id) {
      return null;
    }

    return { timestamp, id };
  } catch {
    return null;
  }
}
