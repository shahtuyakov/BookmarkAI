/**
 * Status of a share processing
 */
export enum ShareStatus {
    PENDING = 'pending',     // Initial state, waiting to be processed
    PROCESSING = 'processing', // Worker has picked up the share
    FETCHING = 'fetching',   // Fetching content from platform
    FETCHED = 'fetched',     // Phase 1: Basic metadata fetched (YouTube two-phase)
    ENRICHED = 'enriched',   // Phase 2: Full enhancement completed (YouTube two-phase)
    DONE = 'done',           // Successfully processed (single-phase platforms)
    ERROR = 'error',         // Error during processing
  }