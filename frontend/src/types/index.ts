/**
 * Frontend Type Definitions
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
