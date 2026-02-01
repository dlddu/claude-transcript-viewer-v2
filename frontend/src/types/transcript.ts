export interface Subagent {
  id: string;
  name: string;
  type?: string;
  content?: string;
  invoked_at?: string;
  transcript_file?: string;
}

export interface ToolUsage {
  name: string;
  invocations: number;
}

export interface TranscriptMetadata {
  model?: string;
  total_tokens?: number;
  duration_ms?: number;
}

export interface Transcript {
  id: string;
  content: string;
  timestamp?: string;
  session_id?: string;
  subagents?: Subagent[];
  metadata?: TranscriptMetadata;
  tools_used?: ToolUsage[];
}
