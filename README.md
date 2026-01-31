# claude-transcript-viewer-v2

A monorepo for viewing Claude conversation transcripts with subagent execution details.

## Project Structure

```
claude-transcript-viewer-v2/
├── frontend/          # React + Vite frontend application
├── backend/           # Node.js + Express backend API
├── e2e/              # Playwright E2E tests
└── .github/          # GitHub Actions workflows
```

## Prerequisites

- Node.js 22+ (required for ESM support)
- npm 10+
- Docker (for LocalStack in development)

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

Run frontend development server:
```bash
npm run dev:frontend
```

Run backend development server:
```bash
npm run dev:backend
```

### Testing

Run E2E tests:
```bash
npm test
```

See [e2e/README.md](./e2e/README.md) for detailed testing instructions.

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Node.js 22, Express, TypeScript
- **Testing**: Playwright, Jest
- **Storage**: AWS S3 (LocalStack for testing)
- **CI/CD**: GitHub Actions

## CI/CD

GitHub Actions workflow runs on:
- Push to `main` or `dld-247-infra-test-env` branches
- Pull requests to `main`

Workflow includes:
- LocalStack service container for S3 testing
- Playwright E2E tests
- Test reports and artifacts upload

## Branch

Current development branch: `dld-247-infra-test-env`

## License

Private repository
