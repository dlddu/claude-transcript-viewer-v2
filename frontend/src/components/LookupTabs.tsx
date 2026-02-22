import { useState } from 'react';
import { SessionIdLookup } from './SessionIdLookup.js';

export interface LookupTabsProps {
  onSessionLookup?: (sessionId: string) => void;
  isLoading?: boolean;
  error?: string;
}

export function LookupTabs({ onSessionLookup, isLoading, error }: LookupTabsProps = {}) {
  const [activeTab, setActiveTab] = useState<'message-uuid' | 'session-id'>('message-uuid');

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
      </div>
      <div role="tabpanel" className="lookup-tabs__panel">
        {activeTab === 'session-id' && (
          <SessionIdLookup
            onLookup={onSessionLookup}
            isLoading={isLoading}
            error={error}
          />
        )}
      </div>
    </div>
  );
}
