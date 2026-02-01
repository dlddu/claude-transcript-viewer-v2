# Development Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Docker (for LocalStack)

## Project Structure

```
claude-transcript-viewer-v2/
├── frontend/          # React + Vite + TypeScript
├── backend/           # Node.js + Express + TypeScript
├── e2e/               # Playwright E2E tests
└── .github/           # GitHub Actions workflows
```

## Getting Started

### 1. Install Dependencies

```bash
# Install all workspace dependencies
npm install
```

### 2. Setup LocalStack (for development)

```bash
# Start LocalStack with S3 service
docker run -d \
  --name localstack \
  -p 4566:4566 \
  -e SERVICES=s3 \
  localstack/localstack:latest
```

### 3. Setup Environment Variables

```bash
# Backend
cp backend/.env.example backend/.env
```

### 4. Run Development Servers

```bash
# Run both frontend and backend concurrently
npm run dev:all

# Or run individually
npm run dev:frontend  # Frontend only (http://localhost:5173)
npm run dev:backend   # Backend only (http://localhost:3000)
```

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests for specific package
npm run test --workspace=frontend
npm run test --workspace=backend
```

### E2E Tests

```bash
# Make sure LocalStack is running and services are started
docker run -d -p 4566:4566 localstack/localstack

# Setup test fixtures
cd e2e && npm run setup

# Run E2E tests
npm run test:e2e

# Run E2E tests in UI mode
cd e2e && npm run test:ui
```

## Linting and Type Checking

```bash
# Run linter for all packages
npm run lint

# Run TypeScript type checking
npm run typecheck
```

## Building

```bash
# Build all packages
npm run build

# Build specific package
npm run build --workspace=frontend
npm run build --workspace=backend
```

## CI/CD

The project uses GitHub Actions for continuous integration:

- **test.yml**: Runs unit tests, E2E tests with LocalStack
- **lint.yml**: Runs linting and type checking

### LocalStack in CI

The E2E tests use LocalStack as a GitHub Actions service:

```yaml
services:
  localstack:
    image: localstack/localstack:latest
    ports:
      - 4566:4566
    env:
      SERVICES: s3
```

Test fixtures are uploaded to LocalStack S3 before running E2E tests.

## Common Issues

### LocalStack not responding

```bash
# Check LocalStack health
curl http://localhost:4566/_localstack/health

# Restart LocalStack
docker restart localstack
```

### Port already in use

```bash
# Check what's using port 3000 or 5173
lsof -i :3000
lsof -i :5173

# Kill the process
kill -9 <PID>
```

## TDD Workflow

This project follows Test-Driven Development:

1. **Red**: Write failing tests first
2. **Green**: Implement minimum code to pass tests
3. **Refactor**: Improve code while keeping tests green

All tests are currently in the **Red phase** (failing) as implementation is pending.
