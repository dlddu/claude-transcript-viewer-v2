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

// Message content can be a string or an array of content blocks
export type MessageContent = string | Array<{
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}>;

// Individual message in a transcript (JSONL line)
export interface TranscriptMessage {
  type: 'user' | 'assistant' | 'queue-operation';
  sessionId: string;
  timestamp: string;
  uuid: string;
  parentUuid: string | null;
  agentId?: string; // 'main' for main agent, subagent ID for subagents
  message?: {
    role: 'user' | 'assistant';
    content: MessageContent;
    model?: string;
  };
  operation?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  userType?: string;
  metadata?: {
    total_tokens?: number;
    duration_ms?: number;
  };
}

export interface Transcript {
  id: string;
  content: string;
  timestamp?: string;
  session_id?: string;
  subagents?: Subagent[];
  metadata?: TranscriptMetadata;
  tools_used?: ToolUsage[];
  messages?: TranscriptMessage[];
}
