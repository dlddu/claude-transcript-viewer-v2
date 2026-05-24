#!/usr/bin/env bash

# Seed transcripts into a running backend via the upload API.
#
# With the SQLite-backed mapping the backend only serves sessions it has an
# entry for, so test/dev data must be ingested through POST /api/transcripts
# rather than copied straight into the bucket. This uploads the e2e fixtures.
#
# Usage:
#   ./scripts/seed-transcripts.sh [API_BASE_URL] [FIXTURES_DIR]
#
# Defaults:
#   API_BASE_URL = http://localhost:3000
#   FIXTURES_DIR = <repo>/e2e/fixtures

set -euo pipefail

API="${1:-http://localhost:3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
FIXTURES="${2:-$REPO_ROOT/e2e/fixtures}"

upload() {
  local id="$1"; shift
  local main="$1"; shift

  if [ ! -f "$main" ]; then
    echo "ERROR: main fixture not found: $main" >&2
    return 1
  fi

  local args=(--fail --silent --show-error -X POST "$API/api/transcripts"
              -F "sessionId=$id"
              -F "file=@$main;type=application/x-ndjson")

  local sub
  for sub in "$@"; do
    [ -e "$sub" ] || continue
    args+=(-F "subagents=@$sub;type=application/x-ndjson")
  done

  echo "==> uploading $id"
  curl "${args[@]}"
  echo
}

upload "session-abc123" "$FIXTURES/session-abc123.jsonl" "$FIXTURES"/session-abc123/agent-*.jsonl
upload "session-xyz789" "$FIXTURES/session-xyz789.jsonl"
upload "session-task-subagent" "$FIXTURES/session-task-subagent.jsonl"
upload "f47ac10b-58cc-4372-a567-0e02b2c3d479" "$FIXTURES/f47ac10b-58cc-4372-a567-0e02b2c3d479.jsonl"

echo "Seeding complete."
