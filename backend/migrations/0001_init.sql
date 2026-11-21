CREATE TABLE IF NOT EXISTS transcript_sessions (
	session_id TEXT PRIMARY KEY,
	s3_prefix  TEXT NOT NULL,
	created_at TEXT NOT NULL
);
