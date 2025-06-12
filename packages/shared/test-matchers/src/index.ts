import { PactMatcher } from './types';

export * from './types';

export interface TermOptions {
  matcher: string;
  generate: string;
}

export type Matcher = PactMatcher;

export const uuid = (example: string = '550e8400-e29b-41d4-a716-446655440000'): Matcher => ({
  'pact:matcher:type': 'regex',
  'pact:generator:type': 'Uuid',
  value: example,
  regex: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
});

export const ulid = (example: string = '01ARZ3NDEKTSV4RRFFQ69G5FAV'): Matcher => ({
  'pact:matcher:type': 'regex',
  'pact:generator:type': 'RandomString',
  value: example,
  regex: '^[0-9A-HJKMNP-TV-Z]{26}$'
});

export const iso8601DateTime = (example: string = '2024-01-15T10:30:00.000Z'): Matcher => ({
  'pact:matcher:type': 'regex',
  'pact:generator:type': 'DateTime',
  value: example,
  format: 'yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'',
  regex: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$'
});

export const like = (template: any): Matcher => ({
  'pact:matcher:type': 'type',
  value: template
});

export const eachLike = (template: any, options?: { min?: number }): Matcher => ({
  'pact:matcher:type': 'type',
  value: [template],
  min: options?.min || 1
});

export const term = (options: TermOptions): Matcher => ({
  'pact:matcher:type': 'regex',
  value: options.generate,
  regex: options.matcher
});

export const integer = (example: number = 1): Matcher => ({
  'pact:matcher:type': 'integer',
  value: example
});

export const decimal = (example: number = 1.23): Matcher => ({
  'pact:matcher:type': 'decimal',
  value: example
});

export const boolean = (example: boolean = true): Matcher => ({
  'pact:matcher:type': 'type',
  value: example
});

export const string = (example: string = 'example'): Matcher => ({
  'pact:matcher:type': 'type',
  value: example
});

export const email = (example: string = 'user@example.com'): Matcher => ({
  'pact:matcher:type': 'regex',
  value: example,
  regex: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
});

export const url = (example: string = 'https://example.com'): Matcher => ({
  'pact:matcher:type': 'regex',
  value: example,
  regex: '^https?://.+'
});

export const oneOf = (...values: any[]): Matcher => ({
  'pact:matcher:type': 'include',
  value: values[0],
  'pact:matcher:values': values
});

export const nullable = (matcher: Matcher): Matcher => ({
  ...matcher,
  'pact:matcher:nullable': true
});

export const jwt = (example?: string): Matcher => ({
  'pact:matcher:type': 'regex',
  value: example || 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  regex: '^[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]*$'
});

export const base64 = (example: string = 'SGVsbG8gV29ybGQ='): Matcher => ({
  'pact:matcher:type': 'regex',
  value: example,
  regex: '^[A-Za-z0-9+/]*={0,2}$'
});

export const semver = (example: string = '1.0.0'): Matcher => ({
  'pact:matcher:type': 'regex',
  value: example,
  regex: '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$'
});

export interface PaginationMatchers {
  page: Matcher;
  pageSize: Matcher;
  totalPages: Matcher;
  totalItems: Matcher;
  hasNextPage: Matcher;
  hasPreviousPage: Matcher;
}

export const paginationMatchers = (): PaginationMatchers => ({
  page: integer(1),
  pageSize: integer(20),
  totalPages: integer(5),
  totalItems: integer(100),
  hasNextPage: boolean(true),
  hasPreviousPage: boolean(false)
});

export interface ErrorResponseMatchers {
  error: {
    code: Matcher;
    message: Matcher;
    timestamp: Matcher;
    path: Matcher;
    requestId: Matcher;
    details?: Matcher;
  };
}

export const errorResponseMatchers = (code: string, message: string): any => ({
  success: false,
  error: {
    code: code,
    message: message,
    timestamp: iso8601DateTime(),
    path: '/v1/shares',
    requestId: uuid(),
    details: {
      retryAfter: 60
    }
  }
});

export interface ShareQueueEntryMatchers {
  id: Matcher;
  url: Matcher;
  createdAt: Matcher;
  status: Matcher;
  source: Matcher;
  metadata?: Matcher;
}

export const shareQueueEntryMatchers = (): ShareQueueEntryMatchers => ({
  id: ulid(),
  url: url(),
  createdAt: iso8601DateTime(),
  status: oneOf('pending', 'processing', 'completed', 'failed'),
  source: oneOf('ios-share-extension', 'android-share-intent', 'webextension', 'react-native'),
  metadata: nullable(like({
    title: string('Example Page'),
    description: string('Example description')
  }))
});