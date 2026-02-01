# claude-transcript-viewer-v2

A web-based viewer for Claude Agent transcripts stored in S3, with support for viewing nested subagent transcripts in a timeline format.

## Project Status

**TDD Red Phase** - Tests have been written following Test-Driven Development methodology. All tests are currently failing as the implementation is pending.

## Features (To Be Implemented)

- Timeline view of Claude transcripts
- Expandable subagent transcript views
- S3-backed storage with LocalStack support
- Real-time data loading
- Modern React UI with Vite

## Architecture

This is a monorepo containing:

- **frontend/**: React + Vite + TypeScript UI
- **backend/**: Node.js + Express API (S3 proxy)
- **e2e/**: Playwright end-to-end tests

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- Docker (for LocalStack)

### Development Setup

```bash
# 1. Clone and install
git clone <repository-url>
cd claude-transcript-viewer-v2
npm install

# 2. Start LocalStack
docker run -d \
  --name localstack \
  -p 4566:4566 \
  -e SERVICES=s3 \
  localstack/localstack:latest

# 3. Setup environment
cp backend/.env.example backend/.env

# 4. Run development servers
npm run dev:all
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

### Running Tests

```bash
# Unit tests (currently failing - TDD Red Phase)
npm test

# E2E tests with LocalStack
cd e2e && npm run setup  # Setup fixtures
npm run test:e2e

# Linting and type checking
npm run lint
npm run typecheck
```

## Testing Strategy

Following **Test-Driven Development (TDD)**:

1. **Red Phase** (Current): Tests written, all failing
2. **Green Phase** (Next): Implement code to pass tests
3. **Refactor Phase** (Final): Optimize while keeping tests green

### Test Coverage

- **Backend Tests** (`backend/src/**/__tests__/`)
  - S3 service integration
  - API route handlers
  - Error handling
  - Health checks

- **Frontend Tests** (`frontend/src/**/__tests__/`)
  - Component rendering
  - User interactions
  - Custom hooks
  - Loading/error states

- **E2E Tests** (`e2e/tests/`)
  - Full user workflows
  - LocalStack S3 integration
  - Timeline interactions
  - Subagent expansion

## CI/CD

GitHub Actions workflows:

- **test.yml**: Runs all tests including E2E with LocalStack service
- **lint.yml**: Code quality checks

LocalStack is configured as a GitHub Actions service for E2E testing.

## Development Guide

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed development instructions.

## Package Documentation

- [Frontend README](./frontend/README.md)
- [Backend README](./backend/README.md)
- [E2E Tests README](./e2e/README.md)

## Next Steps (Implementation Phase)

1. Implement backend S3 service and API routes
2. Implement frontend components and hooks
3. Run tests to verify implementation (Green Phase)
4. Refactor and optimize code

## License

MIT
