package main

import "encoding/json"

// RawObject is a JSON object that preserves every field of its source.
// We use it for transcripts and messages so that fields not modeled
// explicitly (custom metadata, content blocks, etc.) survive a round trip.
type RawObject map[string]json.RawMessage

func (m RawObject) GetString(key string) string {
	raw, ok := m[key]
	if !ok {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return ""
	}
	return s
}

func (m RawObject) SetString(key, value string) {
	b, _ := json.Marshal(value)
	m[key] = b
}

func (m RawObject) SetAny(key string, value any) {
	b, _ := json.Marshal(value)
	m[key] = b
}

// TranscriptMessage is a single JSONL line from a transcript file.
type TranscriptMessage = RawObject

// Transcript is the top-level transcript object returned to clients.
type Transcript = RawObject

// SubagentTranscript describes a subagent file attached to a session.
type SubagentTranscript struct {
	ID             string              `json:"id"`
	Name           string              `json:"name"`
	TranscriptFile string              `json:"transcript_file,omitempty"`
	Content        string              `json:"content,omitempty"`
	Messages       []TranscriptMessage `json:"messages,omitempty"`
}
