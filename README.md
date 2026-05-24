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
│   ├── main.go            # Entry point
│   ├── server.go          # HTTP routing (list, get, upload)
│   ├── s3.go              # S3 service + Hive-style upload
│   ├── db.go              # SQLite session_id -> s3_key mapping store
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
- **Backend**: Go (net/http + AWS SDK for Go v2), SQLite (modernc.org/sqlite, pure Go)
- **E2E Testing**: Playwright
- **Local Development**: MinIO (S3-compatible storage)
- **CI/CD**: GitHub Actions
- **Package Manager**: pnpm workspaces (frontend + e2e), Go modules (backend)

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

### Create the S3 bucket

```bash
# Configure AWS CLI to point at MinIO
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin
export AWS_DEFAULT_REGION=us-east-1
export AWS_ENDPOINT_URL=http://localhost:9000

aws --endpoint-url "$AWS_ENDPOINT_URL" s3 mb s3://test-transcripts
```

### Run development servers

The backend serves only the sessions it has indexed. Transcripts are ingested
through the upload API (`POST /api/transcripts`), which writes the object to S3
under a Hive-style key (`year=YYYY/month=MM/day=DD/hour=HH/<sessionId>.jsonl`)
and records the `session_id → s3_key` mapping in a SQLite database. Copying
objects straight into the bucket is **not** enough — without a mapping every
read returns `404 Transcript not found`.

Required environment variables when targeting MinIO:

```bash
export AWS_ENDPOINT_URL=http://localhost:9000
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin
export S3_BUCKET=test-transcripts
export SQLITE_PATH=./data/transcripts.db   # parent dir is created automatically
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

Once the backend is up, seed the sample fixtures through the upload API:

```bash
./scripts/seed-transcripts.sh http://localhost:3000
```

Visit http://localhost:5173

### Uploading transcripts

`POST /api/transcripts` accepts a `multipart/form-data` body:

| Field       | Required | Description                                          |
| ----------- | -------- | ---------------------------------------------------- |
| `sessionId` | yes      | Session ID used as the lookup key and file name      |
| `file`      | yes      | Main transcript as JSONL                             |
| `subagents` | no       | Zero or more subagent JSONL files (repeat the field) |

```bash
curl -X POST http://localhost:3000/api/transcripts \
  -F "sessionId=session-abc123" \
  -F "file=@e2e/fixtures/session-abc123.jsonl" \
  -F "subagents=@e2e/fixtures/session-abc123/agent-a1b2c3d.jsonl"
```

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

Integration tests require MinIO to be running with the `test-transcripts`
bucket created (see "Create the S3 bucket"). Each test uploads its own fixtures
through the service and uses a temporary SQLite database, so no manual seeding
is needed.

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
- Creates the S3 bucket and seeds fixtures through the upload API
- Runs all test suites
- Uploads Playwright reports as artifacts

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Backend
PORT=3000
AWS_REGION=us-east-1
S3_BUCKET=test-transcripts
AWS_ENDPOINT_URL=http://localhost:9000  # For local MinIO
SQLITE_PATH=./data/transcripts.db       # session_id -> s3_key mapping DB

# Frontend
VITE_API_URL=http://localhost:3000/api
```

In Kubernetes the SQLite database lives on a PersistentVolume mounted at
`/data` (see `k8s/backend/pvc.yaml`); `SQLITE_PATH` defaults to
`/data/transcripts.db` in the container image.

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
