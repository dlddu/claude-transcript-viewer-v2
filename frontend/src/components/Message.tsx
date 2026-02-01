import { useState } from 'react';
import { TranscriptMessage } from '../types';
import { formatTimestamp } from '../utils/formatTimestamp';

interface MessageProps {
  message: TranscriptMessage;
  onTaskLinkClick?: (taskId: string) => void;
}

export function Message({ message, onTaskLinkClick }: MessageProps) {
  const [isInputExpanded, setIsInputExpanded] = useState(false);

  const handleTaskLinkClick = () => {
    if (message.task_id && onTaskLinkClick) {
      onTaskLinkClick(message.task_id);
    }
  };

  return (
    <div className="message" data-testid={`message-type-${message.type}`}>
      {message.parent_task_id && (
        <>
          <div className="subagent-indicator" data-testid="subagent-indicator">
            Subagent
          </div>
          <div className="parent-task-id" data-testid="parent-task-id">
            Parent Task: {message.parent_task_id}
          </div>
        </>
      )}

      <div className="message-header">
        <span className={`message-type ${message.type}`}>
          {message.type}
        </span>
        <span className="message-timestamp" data-testid="message-timestamp">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>

      <div className="message-content">{message.content}</div>

      {message.type === 'tool_use' && message.name && (
        <div className="tool-info">
          <div className="tool-name">Tool: {message.name}</div>
          {message.input && (
            <>
              <button
                className="expand-button"
                data-testid="expand-tool-input"
                onClick={() => setIsInputExpanded(!isInputExpanded)}
              >
                {isInputExpanded ? 'Hide' : 'Show'} Input
              </button>
              {isInputExpanded && (
                <div className="tool-input" data-testid="tool-input-content">
                  {JSON.stringify(message.input, null, 2)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {message.type === 'tool_result' && message.task_id && onTaskLinkClick && (
        <div className="tool-info">
          <span
            className="task-link"
            data-testid="task-link"
            onClick={handleTaskLinkClick}
          >
            View Task: {message.task_id}
          </span>
        </div>
      )}
    </div>
  );
}
