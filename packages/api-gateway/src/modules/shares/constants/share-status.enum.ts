/**
 * Status of a share processing
 */
export enum ShareStatus {
    PENDING = 'pending',     // Initial state, waiting to be processed
    PROCESSING = 'processing', // Worker has picked up the share
    FETCHING = 'fetching',   // Fetching content from platform
    DONE = 'done',           // Successfully processed
    ERROR = 'error',         // Error during processing
  }