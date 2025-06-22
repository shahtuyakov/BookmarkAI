export interface TaskMessage {
  version: '1.0';
  taskType: 'transcribe_whisper' | 'summarize_llm' | 'embed_vectors';
  shareId: string;
  payload: Record<string, any>;
  metadata: {
    correlationId: string;
    timestamp: number;
    retryCount: number;
    traceparent?: string;
  };
}

export interface TranscribePayload {
  mediaUrl: string;
  language?: string | null;
}

export interface SummarizePayload {
  text: string;
  maxTokens?: number;
  style?: 'concise' | 'detailed' | 'bullet_points';
}

export interface EmbedPayload {
  text: string;
  chunkSize?: number;
}

export interface TaskResult {
  success: boolean;
  shareId: string;
  taskType: string;
  result?: any;
  error?: {
    type: string;
    message: string;
  };
  processingMs: number;
}