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
├── backend/               # Node.js + Express S3 proxy
│   ├── src/
│   │   ├── routes/        # API routes
│   │   └── services/      # Business logic (S3 service)
│   └── package.json
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
- **Backend**: Node.js, Express, AWS SDK v3
- **E2E Testing**: Playwright
- **Local Development**: LocalStack (AWS S3 emulation)
- **CI/CD**: GitHub Actions
- **Package Manager**: pnpm workspaces

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker (for LocalStack)

## Installation

```bash
# Install dependencies
pnpm install

# Install Playwright browsers (for E2E tests)
pnpm --filter e2e exec playwright install
```

## Development

### Start LocalStack (for local S3)

```bash
docker run -d \
  --name localstack \
  -p 4566:4566 \
  -e SERVICES=s3 \
  localstack/localstack:latest
```

### Setup test data in LocalStack

```bash
# Install AWS CLI Local
pip install awscli-local

# Create bucket
awslocal s3 mb s3://test-transcripts

# Upload fixtures
awslocal s3 cp e2e/fixtures/ s3://test-transcripts/ --recursive
```

### Run development servers

```bash
# Terminal 1: Start backend
cd backend
cp ../.env.example .env
pnpm dev

# Terminal 2: Start frontend
cd frontend
pnpm dev
```

Visit http://localhost:5173

## Testing

### Unit Tests

```bash
# Run all unit tests
pnpm test:unit

# Run frontend tests only
pnpm --filter frontend test

# Run backend tests only
pnpm --filter backend test

# Watch mode
pnpm --filter frontend test:watch
```

### Integration Tests

Integration tests require LocalStack to be running.

```bash
# Start LocalStack first
docker run -d -p 4566:4566 -e SERVICES=s3 localstack/localstack:latest

# Setup test data
awslocal s3 mb s3://test-transcripts
awslocal s3 cp e2e/fixtures/ s3://test-transcripts/ --recursive

# Run integration tests
pnpm --filter backend test:integration
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

Sample transcript fixtures are located in `e2e/fixtures/`:

- `sample-main-transcript.json` - Main conversation transcript
- `subagent-data-analyzer-20260201-001.json` - Data analysis subagent transcript
- `subagent-visualizer-20260201-001.json` - Visualization subagent transcript

These fixtures demonstrate:
- Main transcript with metadata
- Multiple subagent invocations
- Tool usage tracking
- Hierarchical transcript structure

## CI/CD

GitHub Actions workflow includes:

1. **Unit Tests**: Tests for frontend and backend
2. **Integration Tests**: Backend tests with LocalStack S3
3. **E2E Tests**: Full application tests with Playwright
4. **Linting**: Code quality checks

The workflow automatically:
- Starts LocalStack service
- Creates S3 bucket and uploads fixtures
- Runs all test suites
- Uploads Playwright reports as artifacts

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Backend
PORT=3000
AWS_REGION=us-east-1
S3_BUCKET=test-transcripts
AWS_ENDPOINT_URL=http://localhost:4566  # For LocalStack

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
