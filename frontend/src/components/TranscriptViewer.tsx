import { useMemo, useState } from 'react';
import type { Transcript, TranscriptMessage, EnrichedMessage } from '../types/transcript';
import { enrichMessages } from '../utils/enrichMessages';
import { groupMessages } from '../utils/groupMessages';
import { highlightJson } from '../utils/jsonHighlight';
import { truncateToolId, truncateFilePathsInObject } from '../utils/truncate';
import { TruncatedText } from './TruncatedText';
import { useTranscriptData } from '../hooks/useTranscriptData';
import './TranscriptViewer.css';

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
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [expandedSubagentGroups, setExpandedSubagentGroups] = useState<Set<string>>(new Set());
  const [debugMode, setDebugMode] = useState(false);

  // If transcript is provided as prop, use it; otherwise show loading
  const isProvidedTranscript = propTranscript !== undefined;
  const isProvidedError = propError !== undefined;

  const transcript = isProvidedTranscript ? propTranscript : null;

  const enrichedMessages = useMemo(() => {
    if (!transcript?.messages) return [];
    return enrichMessages(transcript.messages, transcript.session_id, transcript.subagents);
  }, [transcript?.messages, transcript?.session_id, transcript?.subagents]);

  const messageGroups = useMemo(() => groupMessages(enrichedMessages), [enrichedMessages]);

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

  const toggleToolDetail = (messageUuid: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(messageUuid)) {
        next.delete(messageUuid);
      } else {
        next.add(messageUuid);
      }
      return next;
    });
  };

  const toggleSubagentGroup = (groupKey: string) => {
    setExpandedSubagentGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const handleToolClick = (messageUuid: string) => {
    toggleToolDetail(messageUuid);
  };

  const handleToolKeyDown = (event: React.KeyboardEvent, messageUuid: string) => {
    if (event.key === 'Enter') {
      toggleToolDetail(messageUuid);
    }
  };

  const renderMessage = (enriched: EnrichedMessage, showSubagentLabel: boolean) => {
    const hasTool = enriched.toolUses.length > 0;
    const isExpanded = expandedTools.has(enriched.raw.uuid);
    const messageClasses = [
      'message',
      `message-${enriched.raw.message?.role}`,
      enriched.isSubagent ? 'message-subagent' : '',
      hasTool ? 'message-with-tool' : '',
      hasTool && isExpanded ? 'expanded' : ''
    ].filter(Boolean).join(' ');

    return (
      <div
        key={enriched.raw.uuid}
        className={messageClasses}
        data-testid="timeline-item"
        role={hasTool ? 'button' : undefined}
        aria-expanded={hasTool ? isExpanded : undefined}
        tabIndex={hasTool ? 0 : undefined}
        onClick={hasTool ? () => handleToolClick(enriched.raw.uuid) : undefined}
        onKeyDown={hasTool ? (e) => handleToolKeyDown(e, enriched.raw.uuid) : undefined}
        style={hasTool ? { cursor: 'pointer' } : undefined}
      >
        {showSubagentLabel && enriched.isSubagent && enriched.subagentName && (
          <div className="subagent-label" data-testid="subagent-label">
            [Subagent: {enriched.subagentName}]
          </div>
        )}
        <div className="message-role">
          {enriched.raw.message?.role === 'user' ? 'User' : 'Assistant'}:
          {hasTool && (
            <span className="tool-use-indicator" data-testid="tool-use-indicator">
              🔧
            </span>
          )}
          {hasTool && (
            <span className="tool-names-inline" data-testid="tool-names-inline">
              {enriched.toolUses.map(t => t.subagentType ? `${t.name} [${t.subagentType}]` : t.name).join(', ')}
            </span>
          )}
          {hasTool && (
            <span className="expand-indicator" data-testid="expand-indicator" aria-expanded={isExpanded}>
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
        </div>
        <div className="message-content">{enriched.text}</div>

        {hasTool && isExpanded && (
          <div className="tool-details">
            {enriched.toolUses.map((tool) => {
              return (
                <div key={tool.id} className="tool-detail-view" data-testid="tool-detail-view" role="region" aria-label={`Tool details for ${tool.name}`}>
                  <div className="tool-header">
                    <div className="tool-name" data-testid="tool-name">
                      Tool: {tool.name}{tool.subagentType && <span className="tool-subagent-type"> [{tool.subagentType}]</span>}
                    </div>
                    <div className="tool-id" data-testid="tool-id">
                      ID: <TruncatedText text={tool.id} truncatedText={truncateToolId(tool.id)} />
                    </div>
                  </div>

                  <div className="tool-section">
                    <div className="tool-section-title">Input:</div>
                    <div className="tool-input" data-testid="tool-input">
                      <pre><code>{highlightJson(truncateFilePathsInObject(tool.input))}</code></pre>
                    </div>
                  </div>

                  {tool.result && (
                    <div className="tool-section">
                      <div className="tool-section-title">Output:</div>
                      <div
                        className={`tool-output ${tool.result.is_error ? 'tool-output-error' : ''}`}
                        data-testid="tool-output"
                      >
                        <pre><code>{tool.result.content}</code></pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {debugMode && (
          <details className="debug-data" data-testid="debug-data" onClick={(e) => e.stopPropagation()}>
            <summary>Raw Data</summary>
            <pre><code>{JSON.stringify(enriched, null, 2)}</code></pre>
          </details>
        )}
      </div>
    );
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

  const modelFromMessages = getModelFromMessages(transcript!.messages);
  const displayModel = transcript!.metadata?.model || modelFromMessages;

  return (
    <div data-testid="transcript-viewer" className="transcript-viewer">
      {/* Render messages if available, otherwise fall back to content */}
      {enrichedMessages.length > 0 ? (
        <div className="messages" data-testid="timeline-view">
          <button
            className={`debug-toggle ${debugMode ? 'debug-toggle-active' : ''}`}
            onClick={() => setDebugMode(prev => !prev)}
            data-testid="debug-toggle"
          >
            {debugMode ? 'Debug ON' : 'Debug OFF'}
          </button>
          {messageGroups.map((group) => {
            if (group.type === 'main') {
              return renderMessage(group.messages[0], true);
            }

            const isGroupExpanded = expandedSubagentGroups.has(group.groupKey);
            return (
              <div
                key={group.groupKey}
                className="subagent-group"
                data-testid="subagent-group"
              >
                <button
                  className={`subagent-group-header ${isGroupExpanded ? 'subagent-group-header-expanded' : ''}`}
                  onClick={() => toggleSubagentGroup(group.groupKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      toggleSubagentGroup(group.groupKey);
                    }
                  }}
                  aria-expanded={isGroupExpanded}
                  data-testid="subagent-group-header"
                >
                  <span className="subagent-group-indicator">
                    {isGroupExpanded ? '▼' : '▶'}
                  </span>
                  <span className="subagent-group-name">
                    [Subagent: {group.subagentName}]
                  </span>
                  <span className="subagent-group-count" data-testid="subagent-group-count">
                    {group.messages.length} message{group.messages.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {isGroupExpanded && (
                  <div className="subagent-group-body" data-testid="subagent-group-body">
                    {group.messages.map((enriched) => renderMessage(enriched, false))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="main-content">{transcript!.content}</div>
      )}

      {/* Metadata */}
      {(transcript!.metadata || transcript!.session_id || displayModel) && (
        <div className="metadata" data-testid="transcript-metadata">
          {transcript!.session_id && (
            <span className="metadata-item" data-testid="session-id-display">
              Session ID: {transcript!.session_id}
            </span>
          )}
          {displayModel && (
            <span className="metadata-item" data-testid="model-display">
              {displayModel}
            </span>
          )}
          {transcript!.metadata?.total_tokens && (
            <span className="metadata-item">
              {transcript!.metadata.total_tokens} tokens
            </span>
          )}
          {transcript!.metadata?.duration_ms && (
            <span className="metadata-item">
              {transcript!.metadata.duration_ms} ms
            </span>
          )}
        </div>
      )}

      {/* Tools Used */}
      {transcript!.tools_used && transcript!.tools_used.length > 0 && (
        <div className="tools-used">
          <h3>Tools Used:</h3>
          {transcript!.tools_used.map((tool, index) => (
            <div key={index} className="tool-item">
              {tool.name} ({tool.invocations} invocations)
            </div>
          ))}
        </div>
      )}

      {/* Subagents */}
      {transcript!.subagents && transcript!.subagents.length > 0 && (
        <div className="subagents">
          <h3>Subagents:</h3>
          {transcript!.subagents.map((subagent) => {
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
