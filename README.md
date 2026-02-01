# Claude Transcript Viewer v2

A monorepo project for viewing Claude Code transcripts with S3 integration.

## Project Structure

```
claude-transcript-viewer-v2/
├── frontend/          # React + Vite frontend
├── backend/           # Node.js + Express backend (S3 proxy)
├── e2e/              # Playwright E2E tests
├── .github/          # GitHub Actions workflows
└── localstack-init/  # LocalStack initialization scripts
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Node.js, Express, AWS SDK (S3)
- **E2E Testing**: Playwright
- **Local Development**: LocalStack (S3 emulation)
- **CI/CD**: GitHub Actions
- **Package Management**: npm workspaces

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker & Docker Compose (for LocalStack)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start LocalStack (S3 Emulator)

```bash
docker compose up -d localstack
```

Wait for LocalStack to initialize and upload test fixtures.

### 3. Start Development Servers

```bash
# Start both frontend and backend
npm run dev

# Or start individually
npm run dev --workspace=frontend  # http://localhost:3000
npm run dev --workspace=backend   # http://localhost:3001
```

### 4. Run E2E Tests

```bash
# Install Playwright browsers (first time only)
cd e2e && npx playwright install

# Run tests
npm run test:e2e

# Run tests with UI
npm run test:ui --workspace=e2e

# Run tests in headed mode
npm run test:headed --workspace=e2e
```

## Available Scripts

### Root Level

- `npm run dev` - Start all development servers
- `npm run build` - Build all workspaces
- `npm test` - Run tests in all workspaces
- `npm run test:e2e` - Run E2E tests only
- `npm run lint` - Lint all workspaces
- `npm run typecheck` - Type check all workspaces
- `npm run format` - Format all files with Prettier
- `npm run format:check` - Check formatting

### Frontend Workspace

- `npm run dev --workspace=frontend` - Start Vite dev server
- `npm run build --workspace=frontend` - Build for production
- `npm run preview --workspace=frontend` - Preview production build

### Backend Workspace

- `npm run dev --workspace=backend` - Start backend with hot reload
- `npm run build --workspace=backend` - Build TypeScript to JavaScript
- `npm run start --workspace=backend` - Start production server

### E2E Workspace

- `npm test --workspace=e2e` - Run all E2E tests
- `npm run test:ui --workspace=e2e` - Run tests with Playwright UI
- `npm run test:debug --workspace=e2e` - Debug tests
- `npm run test:report --workspace=e2e` - View test report

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### LocalStack (Development)

```env
S3_ENDPOINT=http://localhost:4566
S3_BUCKET_NAME=transcripts
S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
```

### Production (AWS S3)

```env
S3_ENDPOINT=
S3_BUCKET_NAME=your-bucket-name
S3_FORCE_PATH_STYLE=false
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

## Test Fixtures

Sample JSONL transcript files are located in `e2e/fixtures/transcripts/`:

- `main-transcript.jsonl` - Main conversation transcript
- `subagent-transcript.jsonl` - Subagent (codebase-analyzer) transcript
- `test-writer-subagent.jsonl` - Subagent (test-writer) transcript

### JSONL Format

```jsonl
{"type":"message","role":"user","content":"Hello","timestamp":"2026-01-31T10:00:00Z","sessionId":"session-001"}
{"type":"message","role":"assistant","content":"Hi there!","timestamp":"2026-01-31T10:00:01Z","sessionId":"session-001"}
{"type":"subagent_start","agentId":"agent-001","parentSessionId":"session-001","timestamp":"2026-01-31T10:00:02Z"}
```

## CI/CD

### GitHub Actions Workflows

1. **CI Workflow** (`.github/workflows/ci.yml`)
   - Runs on push and PR to main/develop
   - Linting, type checking, and building
   - Runs for both frontend and backend

2. **E2E Tests Workflow** (`.github/workflows/e2e.yml`)
   - Runs on push and PR to main/develop
   - Starts LocalStack with test data
   - Runs Playwright E2E tests
   - Uploads test reports as artifacts

## TDD Approach

This project follows Test-Driven Development (TDD):

### Red Phase (Current)

- E2E tests are written first
- Tests will initially fail (expected behavior)
- Tests define the expected behavior and API contracts

### Green Phase (Next)

- Implement features to make tests pass
- Focus on minimal implementation

### Refactor Phase

- Improve code quality while keeping tests green
- Optimize performance
- Enhance maintainability

## Current Test Status

Most E2E tests will FAIL initially as they test features not yet implemented:

- ✅ Basic page loading
- ✅ Backend health check
- ✅ S3 integration (backend API)
- ❌ Transcript list UI (not implemented)
- ❌ Transcript viewer UI (not implemented)
- ❌ Subagent transcript expansion (not implemented)

## Development Workflow

1. Write tests first (Red phase - tests fail)
2. Implement minimal code to pass tests (Green phase)
3. Refactor code while keeping tests green (Refactor phase)
4. Commit changes with descriptive messages

## Troubleshooting

### LocalStack not starting

```bash
# Check container status
docker compose ps

# View logs
docker compose logs localstack

# Restart
docker compose restart localstack
```

### Tests failing due to services not ready

Ensure all services are running:

```bash
# Check backend
curl http://localhost:3001/api/health

# Check LocalStack S3
docker compose exec localstack awslocal s3 ls s3://transcripts/transcripts/
```

### Port conflicts

Change ports in:
- `frontend/vite.config.ts` (default: 3000)
- `backend/src/server.ts` (default: 3001)
- `docker-compose.yml` (LocalStack: 4566)

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests first (TDD)
4. Implement features
5. Ensure all tests pass
6. Submit a pull request
