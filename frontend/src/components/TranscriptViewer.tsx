import { useState } from 'react';
import type { Transcript, TranscriptMessage, MessageContent } from '../types/transcript';
import { useTranscriptData } from '../hooks/useTranscriptData';

// Helper function to extract text from message content
function getMessageText(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter(block => block.type === 'text' && block.text)
    .map(block => block.text)
    .join('\n');
}

// Helper function to extract model from messages
function getModelFromMessages(messages?: TranscriptMessage[]): string | undefined {
  if (!messages) return undefined;
  for (const msg of messages) {
    if (msg.message?.model) {
      return msg.message.model;
    }
  }
  return undefined;
}

interface TranscriptViewerProps {
  transcript?: Transcript | null;
  error?: Error;
}

export function TranscriptViewer({ transcript: propTranscript, error: propError }: TranscriptViewerProps = {}) {
  const [expandedSubagents, setExpandedSubagents] = useState<Set<string>>(new Set());
  const [subagentData, setSubagentData] = useState<Map<string, Transcript>>(new Map());

  // If transcript is provided as prop, use it; otherwise show loading
  const isProvidedTranscript = propTranscript !== undefined;
  const isProvidedError = propError !== undefined;

  const toggleSubagent = async (subagentId: string, transcriptFile?: string) => {
    const isExpanded = expandedSubagents.has(subagentId);

    setExpandedSubagents(prev => {
      const next = new Set(prev);
      if (isExpanded) {
        next.delete(subagentId);
      } else {
        next.add(subagentId);
      }
      return next;
    });

    // Fetch subagent data if not already loaded and has transcript_file
    if (!isExpanded && transcriptFile && !subagentData.has(subagentId)) {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const fileId = transcriptFile.replace('.json', '');
        const response = await fetch(`${apiUrl}/api/transcripts/${fileId}`);

        if (response.ok) {
          const data = await response.json();
          setSubagentData(prev => new Map(prev).set(subagentId, data));
        }
      } catch (error) {
        console.error('Failed to fetch subagent transcript:', error);
      }
    }
  };

  // Handle error state
  if (isProvidedError || propError) {
    return (
      <div data-testid="transcript-viewer">
        <div className="error-message">
          {propError?.message || 'Failed to fetch transcript'}
        </div>
      </div>
    );
  }

  // Handle null/empty transcript
  if (isProvidedTranscript && propTranscript === null) {
    return (
      <div data-testid="transcript-viewer">
        <div className="no-transcript">No transcript available</div>
      </div>
    );
  }

  // Loading state (only when no transcript prop is provided)
  if (!isProvidedTranscript) {
    return (
      <div data-testid="transcript-viewer">
        <div className="loading">Loading transcript...</div>
      </div>
    );
  }

  const transcript = propTranscript!;
  const modelFromMessages = getModelFromMessages(transcript.messages);
  const displayModel = transcript.metadata?.model || modelFromMessages;

  return (
    <div data-testid="transcript-viewer" className="transcript-viewer">
      <div className="transcript-content">
        {/* Render messages if available, otherwise fall back to content */}
        {transcript.messages && transcript.messages.length > 0 ? (
          <div className="messages">
            {transcript.messages
              .filter(msg => msg.type !== 'queue-operation' && msg.message)
              .map((msg) => (
                <div key={msg.uuid} className={`message message-${msg.message?.role}`}>
                  <div className="message-role">{msg.message?.role === 'user' ? 'User' : 'Assistant'}:</div>
                  <div className="message-content">{getMessageText(msg.message!.content)}</div>
                </div>
              ))}
          </div>
        ) : (
          <div className="main-content">{transcript.content}</div>
        )}

        {/* Metadata */}
        {(transcript.metadata || transcript.session_id || displayModel) && (
          <div className="metadata" data-testid="transcript-metadata">
            {transcript.session_id && (
              <span className="metadata-item" data-testid="session-id-display">
                Session ID: {transcript.session_id}
              </span>
            )}
            {displayModel && (
              <span className="metadata-item" data-testid="model-display">
                {displayModel}
              </span>
            )}
            {transcript.metadata?.total_tokens && (
              <span className="metadata-item">
                {transcript.metadata.total_tokens} tokens
              </span>
            )}
            {transcript.metadata?.duration_ms && (
              <span className="metadata-item">
                {transcript.metadata.duration_ms} ms
              </span>
            )}
          </div>
        )}

        {/* Tools Used */}
        {transcript.tools_used && transcript.tools_used.length > 0 && (
          <div className="tools-used">
            <h3>Tools Used:</h3>
            {transcript.tools_used.map((tool, index) => (
              <div key={index} className="tool-item">
                {tool.name} ({tool.invocations} invocations)
              </div>
            ))}
          </div>
        )}

        {/* Subagents */}
        {transcript.subagents && transcript.subagents.length > 0 && (
          <div className="subagents">
            <h3>Subagents:</h3>
            {transcript.subagents.map((subagent) => {
              const isExpanded = expandedSubagents.has(subagent.id);
              const loadedData = subagentData.get(subagent.id);
              const contentToShow = loadedData?.content || subagent.content;
              const metadataToShow = loadedData?.metadata || undefined;

              return (
                <div key={subagent.id} className="subagent">
                  <button
                    className="subagent-header"
                    onClick={() => toggleSubagent(subagent.id, subagent.transcript_file)}
                  >
                    {subagent.name}
                  </button>
                  {isExpanded && contentToShow && (
                    <div className="subagent-expanded">
                      <div className="subagent-content">{contentToShow}</div>
                      {metadataToShow && (
                        <div className="metadata">
                          {metadataToShow.total_tokens && (
                            <span className="metadata-item">
                              {metadataToShow.total_tokens} tokens
                            </span>
                          )}
                          {metadataToShow.duration_ms && (
                            <span className="metadata-item">
                              {metadataToShow.duration_ms} ms
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Component with data fetching
interface TranscriptViewerWithDataProps {
  transcriptId: string;
}

export function TranscriptViewerWithData({ transcriptId }: TranscriptViewerWithDataProps) {
  const { data, isLoading, error } = useTranscriptData(transcriptId);

  if (isLoading) {
    return (
      <div data-testid="transcript-viewer">
        <div className="loading">Loading transcript...</div>
      </div>
    );
  }

  if (error) {
    return <TranscriptViewer error={error} />;
  }

  return <TranscriptViewer transcript={data} />;
}
