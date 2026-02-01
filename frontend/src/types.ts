export interface TranscriptFile {
  key: string;
  size: number;
  lastModified: Date | string;
}

export interface TranscriptMessage {
  type: string;
  timestamp: string;
  role?: 'user' | 'assistant';
  content?: string;
  text?: string;
  name?: string;
  subagent_transcript?: TranscriptMessage[];
}
