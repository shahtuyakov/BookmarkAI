// scripts/seed/types.ts

// Database configuration types
export interface DBConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface RedisConfig {
  host: string;
  port: number;
}

// Model interfaces
export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
}

export interface Share {
  id: string;
  user_id: string;
  url: string;
  platform: string;
  status: string;
  idempotency_key?: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  id: string;
  share_id: string;
  full_text: string;
  segments: TranscriptSegment[];
  language: string;
}

export interface Embedding {
  id: string;
  share_id: string;
  embedding?: number[];
  dimensions: number;
} 