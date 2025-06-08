/**
 * Singleflight pattern implementation to prevent duplicate concurrent operations
 * Ensures that only one operation runs at a time for a given key
 */
export class SingleFlight<T> {
  private inflight: Map<string, Promise<T>> = new Map();

  /**
   * Execute a function with deduplication - if the same key is requested
   * while an operation is in flight, return the existing promise
   */
  async do(key: string, fn: () => Promise<T>): Promise<T> {
    // Check if there's already an operation in flight for this key
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }

    // Create a new promise for this operation
    const promise = fn()
      .then((result) => {
        // Clean up after successful completion
        this.inflight.delete(key);
        return result;
      })
      .catch((error) => {
        // Clean up after error
        this.inflight.delete(key);
        throw error;
      });

    // Store the promise for deduplication
    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Check if an operation is currently in flight for a given key
   */
  isInflight(key: string): boolean {
    return this.inflight.has(key);
  }

  /**
   * Cancel all in-flight operations (for cleanup)
   */
  clear(): void {
    this.inflight.clear();
  }
}