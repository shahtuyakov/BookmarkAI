/**
 * Queue names for share processing
 */
export const SHARE_QUEUE = {
  NAME: 'share',
  JOBS: {
    PROCESS: 'share.process',
  },
};

// Export job name constant for type safety
export const SHARE_PROCESS_JOB = SHARE_QUEUE.JOBS.PROCESS;