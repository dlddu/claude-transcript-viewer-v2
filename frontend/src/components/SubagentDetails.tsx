/**
 * Subagent Details Component
 * Displays expanded subagent transcript
 */

import type { TranscriptEvent } from '../types';

interface SubagentDetailsProps {
  subagent_name: string;
  transcript_id: string;
  events?: TranscriptEvent[];
  isLoading?: boolean;
  error?: string;
}

export function SubagentDetails({
  subagent_name,
  events,
  isLoading,
  error,
}: SubagentDetailsProps) {
  return (
    <div data-testid="subagent-details" className="subagent-details">
      <div className="subagent-header">
        <h3>{subagent_name}</h3>
      </div>

      {isLoading && (
        <div data-testid="loading-indicator" className="loading">
          Loading subagent transcript...
        </div>
      )}

      {error && (
        <div data-testid="error-message" className="error">
          Failed to load subagent transcript: {error}
        </div>
      )}

      {events && events.length > 0 && (
        <div className="subagent-events">
          {events.map((event, index) => (
            <div key={index} className="subagent-event-item">
              <div className="event-timestamp">
                {new Date(event.timestamp).toLocaleTimeString()}
              </div>
              <div className="event-type">{event.type}</div>
              {event.content && <div className="event-content">{event.content}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
