/**
 * Transcript Timeline Component
 * Displays main transcript timeline with events
 */

import { useState } from 'react';
import type { TranscriptEvent } from '../types';
import { SubagentDetails } from './SubagentDetails';

interface TranscriptTimelineProps {
  events: TranscriptEvent[];
}

export function TranscriptTimeline({ events }: TranscriptTimelineProps) {
  const [expandedSubagent, setExpandedSubagent] = useState<string | null>(null);

  if (!events || events.length === 0) {
    return (
      <div data-testid="transcript-timeline" className="timeline-empty">
        No events to display
      </div>
    );
  }

  const mainEvents = events.filter(
    (event) => event.type !== 'subagent_start'
  );

  const subagentEvents = events.filter(
    (event) => event.type === 'subagent_start'
  );

  const handleSubagentClick = (transcriptId: string) => {
    setExpandedSubagent(expandedSubagent === transcriptId ? null : transcriptId);
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    } catch {
      return timestamp;
    }
  };

  return (
    <div data-testid="transcript-timeline" className="transcript-timeline">
      <div className="timeline-events">
        {mainEvents.map((event, index) => (
          <div key={index} data-testid="main-event" className="timeline-event main-event">
            <div className="event-timestamp">{formatTimestamp(event.timestamp)}</div>
            <div className="event-type">{event.type}</div>
            {event.content && <div className="event-content">{event.content}</div>}
          </div>
        ))}

        {subagentEvents.map((event, index) => (
          <div key={`subagent-${index}`} className="timeline-event-wrapper">
            <div
              data-testid="subagent-event"
              className="timeline-event subagent-event"
              onClick={() => event.transcript_id && handleSubagentClick(event.transcript_id)}
              style={{ cursor: event.transcript_id ? 'pointer' : 'default' }}
            >
              <div className="event-timestamp">{formatTimestamp(event.timestamp)}</div>
              <div className="event-type">Subagent</div>
              <div className="subagent-name">{event.subagent_name}</div>
              {event.task && <div className="subagent-task">{event.task}</div>}
            </div>

            {expandedSubagent === event.transcript_id && (
              <SubagentDetails
                subagent_name={event.subagent_name || 'Unknown'}
                transcript_id={event.transcript_id || ''}
                events={[]}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
