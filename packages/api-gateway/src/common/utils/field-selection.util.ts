/**
 * Utility functions for field selection following ADR-012 conventions
 */

/**
 * Apply field selection to a single object
 */
export function selectFields<T extends Record<string, unknown>>(
  obj: T,
  fields?: string[],
): Partial<T> {
  if (!fields || fields.length === 0) {
    return obj;
  }

  const result: Partial<T> = {};

  for (const field of fields) {
    if (field in obj) {
      result[field as keyof T] = obj[field as keyof T];
    }
  }

  return result;
}

/**
 * Apply field selection to an array of objects
 */
export function selectFieldsFromArray<T extends Record<string, unknown>>(
  items: T[],
  fields?: string[],
): Partial<T>[] {
  if (!fields || fields.length === 0) {
    return items;
  }

  return items.map(item => selectFields(item, fields));
}

/**
 * Validate that requested fields are allowed for a given resource
 */
export function validateFields(
  requestedFields: string[],
  allowedFields: string[],
): { valid: boolean; invalidFields: string[] } {
  const invalidFields = requestedFields.filter(field => !allowedFields.includes(field));

  return {
    valid: invalidFields.length === 0,
    invalidFields,
  };
}

/**
 * Get default fields for a resource if none are specified
 */
export function getDefaultFields(resourceType: string): string[] {
  const defaultFieldsMap: Record<string, string[]> = {
    share: ['id', 'url', 'title', 'status', 'platform', 'createdAt', 'updatedAt'],
    user: ['id', 'email', 'name', 'createdAt'],
    operation: ['id', 'status', 'statusUrl', 'progress'],
  };

  return defaultFieldsMap[resourceType] || [];
}

/**
 * Field selection middleware for common resources
 */
export class FieldSelector {
  private static readonly SHARE_FIELDS = [
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

  private static readonly USER_FIELDS = ['id', 'email', 'name', 'createdAt', 'updatedAt'];

  private static readonly OPERATION_FIELDS = [
    'id',
    'status',
    'statusUrl',
    'progress',
    'result',
    'error',
  ];

  static forShares(fields?: string[]) {
    return new FieldSelector(this.SHARE_FIELDS, fields);
  }

  static forUsers(fields?: string[]) {
    return new FieldSelector(this.USER_FIELDS, fields);
  }

  static forOperations(fields?: string[]) {
    return new FieldSelector(this.OPERATION_FIELDS, fields);
  }

  constructor(
    private allowedFields: string[],
    private requestedFields?: string[],
  ) {}

  /**
   * Validate that all requested fields are allowed
   */
  validate(): { valid: boolean; errors: string[] } {
    if (!this.requestedFields) {
      return { valid: true, errors: [] };
    }

    const validation = validateFields(this.requestedFields, this.allowedFields);

    return {
      valid: validation.valid,
      errors: validation.invalidFields.map(
        field =>
          `Field '${field}' is not available. Available fields: ${this.allowedFields.join(', ')}`,
      ),
    };
  }

  /**
   * Apply field selection to data
   */
  apply<T extends Record<string, unknown>>(data: T): Partial<T>;
  apply<T extends Record<string, unknown>>(data: T[]): Partial<T>[];
  apply<T extends Record<string, unknown>>(data: T | T[]): Partial<T> | Partial<T>[] {
    if (Array.isArray(data)) {
      return selectFieldsFromArray(data, this.requestedFields);
    }
    return selectFields(data, this.requestedFields);
  }

  /**
   * Get the effective fields (requested or all allowed)
   */
  getEffectiveFields(): string[] {
    return this.requestedFields || this.allowedFields;
  }

  /**
   * Check if a specific field is selected
   */
  isFieldSelected(field: string): boolean {
    if (!this.requestedFields) {
      return this.allowedFields.includes(field);
    }
    return this.requestedFields.includes(field);
  }
}

/**
 * Helper to create field selection response metadata
 */
export function createFieldSelectionMeta(
  selector: FieldSelector,
  totalAvailableFields: number,
): Record<string, unknown> {
  const effectiveFields = selector.getEffectiveFields();

  return {
    selectedFields: effectiveFields,
    totalFields: totalAvailableFields,
    fieldsSelected: effectiveFields.length,
    isPartialResponse: effectiveFields.length < totalAvailableFields,
  };
}
