package main

// TranscriptFileRef points a client at one transcript object in S3 via a
// short-lived presigned GET URL. ID identifies the owning agent: the session
// id for the main transcript, the agent id (file base name without ".jsonl")
// for subagents.
type TranscriptFileRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Key  string `json:"key"`
	URL  string `json:"url"`
}

// TranscriptFilesResponse is returned for a session lookup; the backend never proxies transcript bytes.
type TranscriptFilesResponse struct {
	SessionID string              `json:"session_id"`
	ExpiresIn int                 `json:"expires_in"`
	Main      TranscriptFileRef   `json:"main"`
	Subagents []TranscriptFileRef `json:"subagents"`
}

// SessionSummary is one entry in the session list returned by GET /api/transcripts.
type SessionSummary struct {
	SessionID string `json:"session_id"`
	CreatedAt string `json:"created_at"`
}
