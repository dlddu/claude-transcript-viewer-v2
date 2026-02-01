/**
 * Shared Types for Claude Transcript Viewer Backend
 */

export interface TranscriptEvent {
  type: string;
  timestamp: string;
  content?: string;
  subagent_name?: string;
  task?: string;
  transcript_id?: string;
  [key: string]: unknown;
}

export interface TranscriptData {
  events: TranscriptEvent[];
}

export interface S3Config {
  region: string;
  endpoint?: string;
  bucket: string;
  forcePathStyle?: boolean;
}
