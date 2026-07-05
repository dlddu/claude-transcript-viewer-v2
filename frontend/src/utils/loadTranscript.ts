import type {
  Subagent,
  Transcript,
  TranscriptFileRef,
  TranscriptFilesResponse,
  TranscriptMessage,
} from '../types/transcript';

// The backend returns a small manifest of short-lived presigned S3 URLs; the
// browser downloads the actual JSONL files directly from S3 and assembles the
// Transcript locally. Transcript bytes never flow through the backend pod.

// Same-origin by default: production serves the app and API from one origin,
// dev goes through the Vite proxy. VITE_API_URL overrides for split setups.
export function apiBaseUrl(): string {
  return import.meta.env.VITE_API_URL ?? '';
}

export async function fetchTranscriptManifest(sessionId: string): Promise<TranscriptFilesResponse> {
  const response = await fetch(`${apiBaseUrl()}/api/transcript/session/${sessionId}`);

  if (!response.ok) {
    let errorMessage = `Failed to fetch transcript: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // Use default error message if response body is not JSON
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

async function downloadText(url: string, what: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${what}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export function parseJsonlMessages(text: string): TranscriptMessage[] {
  const messages: TranscriptMessage[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    messages.push(JSON.parse(trimmed) as TranscriptMessage);
  }
  return messages;
}

function withDefaultAgentId(messages: TranscriptMessage[], agentId: string): TranscriptMessage[] {
  for (const msg of messages) {
    if (!msg.agentId) {
      msg.agentId = agentId;
    }
  }
  return messages;
}

function timestampValue(msg: TranscriptMessage): number {
  const t = Date.parse(msg.timestamp);
  return Number.isNaN(t) ? 0 : t;
}

export interface SubagentFile {
  ref: TranscriptFileRef;
  text: string;
}

export function assembleTranscript(
  sessionId: string,
  mainText: string,
  subagentFiles: SubagentFile[]
): Transcript {
  const mainMessages = withDefaultAgentId(parseJsonlMessages(mainText), sessionId);

  const subagents: Subagent[] = [];
  const allMessages = [...mainMessages];
  for (const { ref, text } of subagentFiles) {
    let messages: TranscriptMessage[];
    try {
      messages = withDefaultAgentId(parseJsonlMessages(text), ref.id);
    } catch (err) {
      console.warn(`Skipping unparseable subagent transcript ${ref.key}:`, err);
      continue;
    }
    subagents.push({
      id: ref.id,
      name: ref.id,
      transcript_file: ref.key,
      content: text,
      messages,
    });
    allMessages.push(...messages);
  }

  // Stable sort keeps same-timestamp messages in file order, matching the
  // merge the backend used to perform.
  allMessages.sort((a, b) => timestampValue(a) - timestampValue(b));

  const transcript: Transcript = {
    id: sessionId,
    session_id: sessionId,
    messages: allMessages,
  };
  if (subagents.length > 0) {
    transcript.subagents = subagents;
  }
  if (allMessages.length === 0) {
    // Raw text is only rendered when no messages parsed; skip it otherwise so
    // large transcripts aren't held in memory twice.
    transcript.content = mainText;
  }
  return transcript;
}

export async function loadTranscript(sessionId: string): Promise<Transcript> {
  const manifest = await fetchTranscriptManifest(sessionId);

  const mainPromise = downloadText(manifest.main.url, 'transcript');
  const subagentPromises = (manifest.subagents ?? []).map(
    async (ref): Promise<SubagentFile | null> => {
      try {
        return { ref, text: await downloadText(ref.url, `subagent transcript ${ref.id}`) };
      } catch (err) {
        // Match the old backend behavior: an unavailable subagent file is
        // skipped rather than failing the whole transcript.
        console.warn(`Skipping subagent transcript ${ref.key}:`, err);
        return null;
      }
    }
  );

  const [mainText, ...subagentResults] = await Promise.all([mainPromise, ...subagentPromises]);
  const subagentFiles = subagentResults.filter((file): file is SubagentFile => file !== null);

  return assembleTranscript(manifest.session_id, mainText, subagentFiles);
}
