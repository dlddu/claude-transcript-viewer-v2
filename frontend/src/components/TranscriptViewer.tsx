import { useState } from 'react';
import { TranscriptMessage } from '../types';

interface TranscriptViewerProps {
  messages: TranscriptMessage[];
}

interface MessageItemProps {
  message: TranscriptMessage;
}

function MessageItem({ message }: MessageItemProps) {
  const [showSubagent, setShowSubagent] = useState(false);
  const hasSubagent = message.subagent_transcript && message.subagent_transcript.length > 0;

  const getMessageContent = (msg: TranscriptMessage): string => {
    return msg.content || msg.text || '';
  };

  const formatTimestamp = (timestamp: string): string => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  return (
    <div data-testid="transcript-message">
      <div
        data-testid={`message-${message.role || 'unknown'}`}
        style={{
          padding: '12px',
          margin: '8px 0',
          backgroundColor: message.role === 'user' ? '#e3f2fd' : '#f5f5f5',
          borderRadius: '8px',
          borderLeft: `4px solid ${message.role === 'user' ? '#2196F3' : '#4CAF50'}`,
        }}
      >
        <div style={{ fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
          <strong>{message.role || message.type}</strong>
          <span data-testid="message-timestamp" style={{ marginLeft: '8px' }}>
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
        <div>{getMessageContent(message)}</div>

        {hasSubagent && (
          <div style={{ marginTop: '8px' }}>
            <button
              data-testid="subagent-indicator"
              onClick={() => setShowSubagent(!showSubagent)}
              style={{
                padding: '4px 8px',
                fontSize: '0.85em',
                cursor: 'pointer',
                backgroundColor: '#ff9800',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
              }}
            >
              {showSubagent ? 'Hide' : 'Show'} Subagent Transcript ({message.subagent_transcript?.length} messages)
            </button>
          </div>
        )}
      </div>

      {hasSubagent && showSubagent && (
        <div
          data-testid="subagent-transcript"
          style={{
            marginLeft: '24px',
            paddingLeft: '16px',
            borderLeft: '2px solid #ff9800',
          }}
        >
          {message.subagent_transcript?.map((subMsg, idx) => (
            <div
              key={idx}
              data-testid="subagent-message"
              style={{
                padding: '8px',
                margin: '4px 0',
                backgroundColor: '#fff3e0',
                borderRadius: '4px',
                fontSize: '0.9em',
              }}
            >
              <div style={{ fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
                <strong>{subMsg.role || subMsg.type}</strong>
                <span style={{ marginLeft: '8px' }}>{formatTimestamp(subMsg.timestamp)}</span>
              </div>
              <div>{getMessageContent(subMsg)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TranscriptViewer({ messages }: TranscriptViewerProps) {
  return (
    <div data-testid="transcript-viewer" style={{ padding: '16px' }}>
      <h2>Transcript Messages</h2>
      {messages.map((message, index) => (
        <MessageItem key={index} message={message} />
      ))}
    </div>
  );
}
