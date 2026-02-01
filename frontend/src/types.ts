export interface TranscriptMessage {
  type: 'system' | 'human' | 'assistant' | 'tool_use' | 'tool_result';
  content: string;
  timestamp: string;
  name?: string;
  input?: Record<string, unknown>;
  task_id?: string;
  parent_task_id?: string;
  metadata?: {
    model?: string;
    [key: string]: unknown;
  };
}

export interface TranscriptViewerProps {
  bucket: string;
  transcriptKey: string;
}
