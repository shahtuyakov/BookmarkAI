export enum VideoWorkflowState {
  PENDING = 'video_pending',
  TRANSCRIBING = 'video_transcribing',
  SUMMARIZING = 'video_summarizing',
  COMPLETED = 'completed',
  FAILED_TRANSCRIPTION = 'failed_transcription',
}

export interface VideoWorkflowMetadata {
  workflowState: VideoWorkflowState | null;
  enhancementStartedAt: Date | null;
  enhancementCompletedAt: Date | null;
  enhancementVersion: number;
}

export interface VideoEnhancementFlags {
  enabled: boolean;
  platforms: string[];
  userPercentage: number;
  internalUsersOnly: boolean;
}