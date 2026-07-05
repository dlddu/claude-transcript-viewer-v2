import { useState } from 'react';
import { SessionIdLookup } from './SessionIdLookup.js';
import { MessageUuidLookup } from './MessageUuidLookup.js';
import { SessionList } from './SessionList.js';

export interface LookupTabsProps {
  onSessionLookup?: (sessionId: string) => void;
  isLoading?: boolean;
  error?: string;
}

export function LookupTabs({ onSessionLookup, isLoading, error }: LookupTabsProps = {}) {
  const [activeTab, setActiveTab] = useState<'message-uuid' | 'session-id' | 'sessions'>(
    'message-uuid'
  );

  return (
    <div className="lookup-tabs">
      <div role="tablist" className="lookup-tabs__tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'message-uuid'}
          className={`lookup-tabs__tab${activeTab === 'message-uuid' ? ' lookup-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('message-uuid')}
        >
          Message UUID
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'session-id'}
          className={`lookup-tabs__tab${activeTab === 'session-id' ? ' lookup-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('session-id')}
        >
          Session ID
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'sessions'}
          className={`lookup-tabs__tab${activeTab === 'sessions' ? ' lookup-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          Sessions
        </button>
      </div>
      <div role="tabpanel" className="lookup-tabs__panel">
        {activeTab === 'message-uuid' && (
          <MessageUuidLookup
            onLookup={onSessionLookup}
            isLoading={isLoading}
            error={error}
          />
        )}
        {activeTab === 'session-id' && (
          <SessionIdLookup
            onLookup={onSessionLookup}
            isLoading={isLoading}
            error={error}
          />
        )}
        {activeTab === 'sessions' && (
          <SessionList onSessionLookup={onSessionLookup} />
        )}
      </div>
    </div>
  );
}
