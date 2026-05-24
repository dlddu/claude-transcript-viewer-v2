# Claude Transcript Viewer v2

A monorepo application for viewing Claude conversation transcripts with support for subagent visualization.

## Project Structure

```
claude-transcript-viewer-v2/
├── frontend/              # React + Vite frontend application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   └── test/          # Test utilities
│   └── package.json
├── backend/               # Go S3 proxy (net/http + AWS SDK for Go v2)
│   ├── main.go            # Entry point + `seed` subcommand dispatch
│   ├── server.go          # HTTP routing
│   ├── s3.go              # S3 service, Hive paths, presigned upload URLs
│   ├── store.go           # SQLite session→S3-key mapping (modernc.org/sqlite)
│   ├── seed.go            # `seed` subcommand: import fixtures to S3 + SQLite
│   └── go.mod
├── e2e/                   # Playwright E2E tests
│   ├── fixtures/          # Sample transcript fixtures
│   ├── tests/             # E2E test specs
│   └── package.json
├── .github/
│   └── workflows/
│       └── test.yml       # CI/CD pipeline with LocalStack
└── package.json           # Root workspace configuration
```

## Technology Stack

- **Frontend**: React 18, Vite, TypeScript, Vitest
- **Backend**: Go (net/http + AWS SDK for Go v2)
- **Session index**: SQLite (pure-Go `modernc.org/sqlite`, no CGO)
- **E2E Testing**: Playwright
- **Local Development**: MinIO (S3-compatible storage)
- **CI/CD**: GitHub Actions
- **Package Manager**: pnpm workspaces (frontend + e2e), Go modules (backend)

## Storage Model

Transcripts are stored in S3 under **Hive-style partitioned keys** and indexed
by a SQLite database that maps each session id to its key prefix:

```
{S3_PREFIX}year=YYYY/month=MM/day=DD/hour=HH/session_id=<id>/<id>.jsonl
{S3_PREFIX}year=YYYY/month=MM/day=DD/hour=HH/session_id=<id>/agent-<id>.jsonl
{S3_PREFIX}year=YYYY/month=MM/day=DD/hour=HH/session_id=<id>/subagents/<file>
```

Subagent transcripts are discovered either as `agent-*.jsonl` directly in the
session directory or as any file under a `subagents/` subdirectory.

- **Upload**: `POST /api/transcripts/upload-url/{sessionId}` returns a
  presigned S3 `PUT` URL for `<sessionId>.jsonl`. The server computes the
  session's Hive prefix once, persists the `session_id → s3_prefix` mapping
  in SQLite, and reuses it for subsequent files (e.g. subagents) so a
  session's files share one directory.

  ```bash
  curl -X POST http://localhost:3000/api/transcripts/upload-url/session-abc123
  # => {"url":"https://...","method":"PUT",
  #     "key":"year=.../session_id=session-abc123/session-abc123.jsonl",
  #     "session_id":"session-abc123","expires_in":900}

  # Then upload the file directly to S3:
  curl -X PUT --upload-file session-abc123.jsonl "<url from above>"
  ```

  Optional `?file_name=` targets a specific file; it defaults to
  `<sessionId>.jsonl`. It accepts `<name>.jsonl` or `subagents/<name>.jsonl`
  (e.g. `?file_name=subagents/agent-xyz.jsonl`) for subagent uploads.

- **Download**: `GET /api/transcript/session/{id}` resolves the S3 prefix
  from SQLite (returning `404` when a session is not mapped), then lists and
  merges the main transcript with any subagent files.

- **Seeding / import**: `server seed --dir <fixtures>` uploads a directory of
  `*.jsonl` fixtures to their Hive keys and records the mappings, using the
  same code paths as the server. The `DB_PATH` and AWS env vars select the
  database and bucket. This is how CI populates MinIO/LocalStack.

The SQLite database path is configured by `DB_PATH`. In Kubernetes it is
backed by a `PersistentVolumeClaim` (`k8s/backend/pvc.yaml`) mounted at
`/data`, and the backend Deployment uses the `Recreate` strategy because
SQLite allows only a single writer.

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Go >= 1.24
- Docker (for MinIO)

## Installation

```bash
# Install dependencies
pnpm install

# Install Playwright browsers (for E2E tests)
pnpm --filter e2e exec playwright install
```

## Development

### Start MinIO (S3-compatible storage)

```bash
docker run -d \
  --name minio \
  -p 9000:9000 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio:latest server /data
```

### Setup test data in MinIO

```bash
# Configure AWS CLI to point at MinIO
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin
export AWS_DEFAULT_REGION=us-east-1
export AWS_ENDPOINT_URL=http://localhost:9000

# Create the bucket
aws --endpoint-url "$AWS_ENDPOINT_URL" s3 mb s3://test-transcripts

# Seed fixtures to Hive-partitioned keys and build the SQLite index.
# Uses the same DB_PATH the backend reads from.
cd backend
S3_BUCKET=test-transcripts DB_PATH=transcripts.db go run . seed --dir ../e2e/fixtures
cd ..
```

### Run development servers

The backend reads transcripts exclusively from the configured S3 bucket. There
is no built-in mock fallback, so the bucket must be populated before the
backend can serve data — otherwise every request returns `404 Transcript not
found`.

Required environment variables when targeting MinIO:

```bash
export AWS_ENDPOINT_URL=http://localhost:9000
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin
export S3_BUCKET=test-transcripts
```

Then start the dev servers:

```bash
# Terminal 1: Start backend (Go)
cd backend
cp ../.env.example .env  # Edit to match the variables above
go run .

# Terminal 2: Start frontend
cd frontend
pnpm dev
```

Visit http://localhost:5173

## Testing

### Unit Tests

```bash
# Run all unit tests (frontend only — backend uses Go)
pnpm test:unit

# Run frontend tests only
pnpm --filter frontend test

# Run backend tests only (Go)
cd backend && go test ./...

# Watch mode (frontend)
pnpm --filter frontend test:watch
```

### Integration Tests

Integration tests require MinIO to be running with the bucket and fixtures from
the setup steps above.

```bash
# Run backend integration tests against MinIO
cd backend
AWS_ENDPOINT_URL=http://localhost:9000 \
AWS_ACCESS_KEY_ID=minioadmin \
AWS_SECRET_ACCESS_KEY=minioadmin \
go test -tags=integration ./...
```

### E2E Tests

```bash
# Run E2E tests
pnpm --filter e2e test

# Run with UI
pnpm --filter e2e test:ui

# Run in headed mode
pnpm --filter e2e test:headed

# Debug tests
pnpm --filter e2e test:debug
```

## Test Fixtures

Sample transcript fixtures live in `e2e/fixtures/` and are the single source of
truth for backend integration tests and E2E tests:

- `session-abc123.jsonl` + `session-abc123/agent-*.jsonl` - Session-based JSONL transcript with subagents
- `session-xyz789.jsonl`, `session-task-subagent.jsonl`, `f47ac10b-...jsonl` - Additional session fixtures

These fixtures demonstrate:
- Session-based JSONL transcripts
- A main session with multiple subagent transcripts
- A unified main + subagent message timeline
- Tool use / tool result blocks

## CI/CD

GitHub Actions workflow includes:

1. **Unit Tests**: Tests for frontend and backend
2. **Integration Tests**: Backend tests with MinIO S3
3. **E2E Tests**: Full application tests with Playwright
4. **Linting**: Code quality checks

The workflow automatically:
- Starts MinIO service
- Creates S3 bucket and uploads fixtures
- Runs all test suites
- Uploads Playwright reports as artifacts

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Backend
PORT=3000
DB_PATH=transcripts.db                  # SQLite session index
AWS_REGION=us-east-1
S3_BUCKET=test-transcripts
AWS_ENDPOINT_URL=http://localhost:9000  # For local MinIO
# UPLOAD_URL_TTL_SECONDS=900            # Presigned upload URL lifetime

# Frontend
VITE_API_URL=http://localhost:3000/api
```

## Scripts

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run E2E tests only
pnpm test:e2e

# Lint all packages
pnpm lint

# Type check all packages
pnpm typecheck

# Build all packages
pnpm build
```

## Test-Driven Development (TDD)

This project follows TDD principles:

1. **Red Phase** (Current): Tests are written first and will fail
2. **Green Phase** (Next): Implement minimum code to pass tests
3. **Refactor Phase**: Optimize and clean up code

Current test coverage:
- Frontend: Component and hook tests
- Backend: API route and S3 service tests
- E2E: User flow and navigation tests

## Next Steps

1. Implement frontend components (TranscriptViewer, etc.)
2. Implement backend API routes and S3 service
3. Run tests to verify implementation
4. Add additional features as needed

## License

MIT
