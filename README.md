# Claude Transcript Viewer v2

A modern, monorepo-based viewer for Claude Code transcripts with support for subagent conversations.

## Features

- 📊 View Claude Code conversation transcripts in JSONL format
- 🔗 Navigate between main and subagent transcripts
- 🗄️ S3-based storage (AWS S3 or LocalStack)
- 🧪 Comprehensive E2E testing with Playwright
- 🚀 CI/CD with GitHub Actions

## Architecture

This is a monorepo project with three main packages:

- **frontend**: React + Vite application for viewing transcripts
- **backend**: Express.js server that proxies S3 requests
- **e2e**: Playwright end-to-end tests

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker (for LocalStack)

### Installation

```bash
# Install dependencies
pnpm install

# Install Playwright browsers
pnpm --filter e2e exec playwright install chromium
```

### Local Development

```bash
# Start LocalStack
docker-compose up -d localstack

# Setup S3 bucket and upload fixtures
chmod +x .github/scripts/setup-localstack.sh
.github/scripts/setup-localstack.sh

# Start all services
pnpm dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:3000

### Running Tests

```bash
# Run E2E tests
pnpm test:e2e

# Run tests in UI mode
pnpm --filter e2e test:ui

# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint
```

## Project Structure

```
claude-transcript-viewer-v2/
├── .github/
│   ├── workflows/
│   │   └── ci.yml                 # GitHub Actions CI/CD
│   └── scripts/
│       └── setup-localstack.sh    # LocalStack setup script
├── packages/
│   ├── frontend/                  # React frontend
│   │   ├── src/
│   │   │   ├── App.tsx           # Main application component
│   │   │   └── main.tsx          # Entry point
│   │   ├── vite.config.ts
│   │   └── package.json
│   ├── backend/                   # Express backend
│   │   ├── src/
│   │   │   └── index.ts          # API server with S3 proxy
│   │   └── package.json
│   └── e2e/                       # Playwright tests
│       ├── tests/
│       │   ├── transcript-viewer.spec.ts
│       │   └── localstack-integration.spec.ts
│       ├── playwright.config.ts
│       └── package.json
├── fixtures/                      # Test data
│   ├── main-transcript.jsonl
│   └── subagent-transcript.jsonl
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

## Testing

This project follows Test-Driven Development (TDD). See [TESTING.md](./TESTING.md) for detailed testing documentation.

### Current Status

⚠️ **TDD Red Phase**: Tests are written but implementation is incomplete. This is expected in the TDD workflow.

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Backend
PORT=3000

# S3 Configuration
S3_ENDPOINT=http://localhost:4566
S3_BUCKET_NAME=transcripts
S3_FORCE_PATH_STYLE=true
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# Frontend
BACKEND_URL=http://localhost:3000
```

## Transcript Format

Transcripts are stored in JSONL (JSON Lines) format. Each line is a JSON object:

```jsonl
{"timestamp":"2026-01-31T10:00:00.000Z","role":"user","content":"Message content"}
{"timestamp":"2026-01-31T10:00:05.000Z","role":"assistant","content":"Response","subagent_id":"test-writer-001"}
```

### Fields

- `timestamp`: ISO 8601 timestamp
- `role`: "user" | "assistant" | "system"
- `content`: Message content
- `subagent_id` (optional): Reference to subagent conversation

## CI/CD

GitHub Actions workflow runs on every push and pull request:

1. **Type Check & Lint**: Validates code quality
2. **E2E Tests**: Runs Playwright tests with LocalStack

See `.github/workflows/ci.yml` for details.

## License

MIT