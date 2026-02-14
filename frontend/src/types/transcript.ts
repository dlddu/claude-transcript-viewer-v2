export interface Subagent {
  id: string;
  name: string;
  type?: string;
  content?: string;
  invoked_at?: string;
  transcript_file?: string;
  messages?: TranscriptMessage[]; // Parsed messages from subagent transcript
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
  is_error?: boolean;
}>;

// Individual message in a transcript (JSONL line)
export interface TranscriptMessage {
  type: 'user' | 'assistant' | 'queue-operation';
  sessionId: string;
  timestamp: string;
  uuid: string;
  parentUuid: string | null;
  agentId?: string; // Identifies which agent (main or subagent) this message belongs to
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

export interface EnrichedToolUse {
  id: string;
  name: string;
  input: unknown;
  result: {
    content: string;
    is_error?: boolean;
    sourceMessageUuid: string;
  } | null;
  subagentType?: string;
}

export interface EnrichedMessage {
  raw: TranscriptMessage;
  text: string;
  isSubagent: boolean;
  subagentName: string | null;
  toolUses: EnrichedToolUse[];
}

export type MessageGroup =
  | { type: 'main'; messages: EnrichedMessage[] }
  | {
      type: 'subagent';
      groupKey: string;
      agentId: string;
      subagentName: string;
      messages: EnrichedMessage[];
    };
