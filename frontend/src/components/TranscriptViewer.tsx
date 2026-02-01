import { useState, useEffect } from 'react';
import { TranscriptMessage } from '../types';
import { Message } from './Message';

interface TranscriptViewerProps {
  bucket: string;
  transcriptKey: string;
}

export function TranscriptViewer({ bucket, transcriptKey }: TranscriptViewerProps) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [filteredMessages, setFilteredMessages] = useState<TranscriptMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTranscript();
  }, [bucket, transcriptKey]);

  useEffect(() => {
    filterMessages();
  }, [messages, searchQuery, filterType]);

  const loadTranscript = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/transcript?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(transcriptKey)}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Transcript not found');
        }
        throw new Error('Error loading transcript');
      }

      const text = await response.text();
      const lines = text.trim().split('\n').filter(line => line.trim());

      const parsedMessages: TranscriptMessage[] = [];

      for (const line of lines) {
        try {
          const message = JSON.parse(line) as TranscriptMessage;
          parsedMessages.push(message);
        } catch (err) {
          throw new Error('Parse error: Invalid JSONL format');
        }
      }

      setMessages(parsedMessages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const filterMessages = () => {
    let filtered = messages;

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(msg => msg.type === filterType);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(msg => {
        const content = msg.content?.toLowerCase() || '';
        const name = msg.name?.toLowerCase() || '';
        const inputStr = msg.input ? JSON.stringify(msg.input).toLowerCase() : '';

        return content.includes(query) || name.includes(query) || inputStr.includes(query);
      });
    }

    setFilteredMessages(filtered);
  };

  const handleTaskLinkClick = (taskId: string) => {
    // Navigate to subagent transcript
    const subagentKey = transcriptKey.replace('main.jsonl', 'subagent.jsonl');
    const newUrl = `${window.location.pathname}?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(subagentKey)}`;
    window.location.href = newUrl;
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return (
      <div className="error-message" data-testid="error-message">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="controls">
        <input
          type="text"
          className="search-input"
          data-testid="search-input"
          placeholder="Search messages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="filter-select"
          data-testid="message-type-filter"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">All Messages</option>
          <option value="system">System</option>
          <option value="human">Human</option>
          <option value="assistant">Assistant</option>
          <option value="tool_use">Tool Use</option>
          <option value="tool_result">Tool Result</option>
        </select>
        <div className="message-count" data-testid="message-count">
          {filteredMessages.length} {filteredMessages.length === 1 ? 'message' : 'messages'}
        </div>
      </div>

      <div className="message-list" data-testid="message-list">
        {filteredMessages.map((message, index) => (
          <Message
            key={index}
            message={message}
            onTaskLinkClick={handleTaskLinkClick}
          />
        ))}
      </div>
    </div>
  );
}
