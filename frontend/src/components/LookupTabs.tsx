import { useState } from 'react';
import { SessionIdLookup } from './SessionIdLookup.js';

export interface LookupTabsProps {
  onLookup: (sessionId: string) => void;
  isLoading: boolean;
  error: string | null;
}

type ActiveTab = 'message-uuid' | 'session-id';

export function LookupTabs({ onLookup, isLoading, error }: LookupTabsProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('message-uuid');

  return (
    <div className="lookup-tabs">
      <div role="tablist" className="lookup-tabs-list">
        <button
          role="tab"
          aria-selected={activeTab === 'message-uuid'}
          className={`lookup-tab${activeTab === 'message-uuid' ? ' lookup-tab--active' : ''}`}
          onClick={() => setActiveTab('message-uuid')}
        >
          Message UUID
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'session-id'}
          className={`lookup-tab${activeTab === 'session-id' ? ' lookup-tab--active' : ''}`}
          onClick={() => setActiveTab('session-id')}
        >
          Session ID
        </button>
      </div>

      <div className="lookup-tabs-panel">
        {activeTab === 'session-id' && (
          <SessionIdLookup
            onLookup={onLookup}
            isLoading={isLoading}
            error={error ?? undefined}
          />
        )}
      </div>
    </div>
  );
}
