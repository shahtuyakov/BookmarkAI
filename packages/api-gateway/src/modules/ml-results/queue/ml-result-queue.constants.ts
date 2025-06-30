export const ML_RESULT_QUEUE = {
  NAME: 'ml-result-listener',
  JOBS: {
    CHECK_COMPLETIONS: 'check-completions',
    PROCESS_TRANSCRIPTION: 'process-transcription-complete',
    PROCESS_SUMMARY: 'process-summary-complete',
    CHECK_TIMEOUTS: 'check-timeouts',
  },
  CRON: {
    CHECK_COMPLETIONS: '*/5 * * * * *', // Every 5 seconds
    CHECK_TIMEOUTS: '*/60 * * * * *', // Every minute
  },
} as const;