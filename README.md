# Claude Transcript Viewer v2

A modern web application for viewing and analyzing Claude AI conversation transcripts, including support for nested subagent conversations.

## Project Structure

This is a monorepo containing three packages:

```
claude-transcript-viewer-v2/
├── frontend/          # React + Vite frontend application
├── backend/           # Node.js + Express backend (S3 proxy)
├── e2e/              # Playwright E2E tests with LocalStack
└── .github/
    └── workflows/    # GitHub Actions CI/CD
```

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker (for LocalStack)

### Installation

Install all dependencies:

```bash
npm run install:all
```

### Development

Start LocalStack (S3 emulation):

```bash
docker run -d -p 4566:4566 \
  -e SERVICES=s3 \
  -e DEBUG=1 \
  localstack/localstack:latest
```

Start the backend:

```bash
npm run dev:backend
```

Start the frontend:

```bash
npm run dev:frontend
```

### Testing

Run E2E tests:

```bash
npm test
```

Run tests in UI mode:

```bash
npm run test:ui
```

## Features

- View Claude conversation transcripts stored in S3
- Support for different message types (system, human, assistant, tool_use, tool_result)
- Navigate between main and subagent transcripts
- Search and filter messages
- Mobile-responsive design
- Real-time transcript streaming (planned)

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Node.js, Express, AWS SDK v3
- **Testing**: Playwright, LocalStack
- **CI/CD**: GitHub Actions

## Development Workflow

This project follows Test-Driven Development (TDD):

1. **Red Phase**: Write failing tests (current state)
2. **Green Phase**: Implement minimum code to pass tests
3. **Refactor Phase**: Improve code while maintaining passing tests

## Documentation

- [E2E Testing Guide](./e2e/README.md)
- [Frontend Documentation](./frontend/README.md) (coming soon)
- [Backend Documentation](./backend/README.md) (coming soon)

## CI/CD

GitHub Actions automatically runs:
- E2E tests with LocalStack
- Linting and type checking
- Build verification

See [.github/workflows/ci.yml](./.github/workflows/ci.yml) for details.

## License

MIT