# Testing Guide

This document describes the testing setup for the Claude Transcript Viewer project.

## Overview

The project uses a Test-Driven Development (TDD) approach with the following test layers:

- **E2E Tests**: Playwright tests that verify the complete user flow
- **Integration Tests**: Tests that verify backend API integration with LocalStack S3
- **Type Checking**: TypeScript compiler checks

## Test Structure

```
packages/
└── e2e/
    ├── tests/
    │   ├── transcript-viewer.spec.ts      # UI and UX tests
    │   └── localstack-integration.spec.ts # S3 integration tests
    └── playwright.config.ts
```

## Running Tests Locally

### Prerequisites

```bash
# Install dependencies
pnpm install

# Install Playwright browsers
pnpm --filter e2e exec playwright install chromium
```

### Start LocalStack

```bash
# Start LocalStack with Docker Compose
docker-compose up -d localstack

# Setup S3 bucket and upload fixtures
chmod +x .github/scripts/setup-localstack.sh
.github/scripts/setup-localstack.sh
```

### Run Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run tests in headed mode (see browser)
pnpm --filter e2e test:headed

# Run tests in UI mode (interactive)
pnpm --filter e2e test:ui

# Debug tests
pnpm --filter e2e test:debug
```

### View Test Results

```bash
# Open HTML report
pnpm --filter e2e report
```

## Test Fixtures

Test fixtures are located in the `fixtures/` directory:

- `main-transcript.jsonl`: Main conversation transcript with subagent references
- `subagent-transcript.jsonl`: Subagent conversation transcript

### Fixture Format

Each line is a JSON object following the Claude Code transcript format:

```jsonl
{"timestamp":"2026-01-31T10:00:00.000Z","role":"user","content":"Message content"}
{"timestamp":"2026-01-31T10:00:05.000Z","role":"assistant","content":"Response","subagent_id":"test-writer-001"}
```

## GitHub Actions CI

The CI workflow (`.github/workflows/ci.yml`) runs automatically on:

- Push to `main` branch
- Pull requests to `main` branch

### CI Steps

1. **Type Check & Lint**: Validates TypeScript types and code style
2. **E2E Tests**: Runs Playwright tests with LocalStack S3 service

### LocalStack in CI

The workflow uses GitHub Actions service containers to run LocalStack:

```yaml
services:
  localstack:
    image: localstack/localstack:latest
    ports:
      - 4566:4566
    env:
      SERVICES: s3
```

## Writing New Tests

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/');

    // Wait for element
    await expect(page.getByTestId('element')).toBeVisible();

    // Interact with UI
    await page.getByRole('button', { name: 'Click me' }).click();

    // Assert result
    await expect(page.getByTestId('result')).toContainText('Expected');
  });
});
```

### Test Best Practices

1. **Use data-testid attributes** for reliable element selection
2. **Wait for visibility** before interacting with elements
3. **Test user flows**, not implementation details
4. **Keep tests independent** - each test should run in isolation
5. **Use descriptive test names** that explain the expected behavior

## Current Test Status

⚠️ **TDD Red Phase**: Tests are currently failing as the implementation is not yet complete. This is expected in the TDD workflow.

### Next Steps

1. ✅ Tests written (Red phase)
2. ⏳ Implementation (Green phase) - **Current step**
3. ⏳ Refactoring (Refactor phase)

## Troubleshooting

### LocalStack Connection Issues

```bash
# Check LocalStack health
curl http://localhost:4566/_localstack/health

# List S3 buckets
aws --endpoint-url=http://localhost:4566 s3 ls

# List bucket contents
aws --endpoint-url=http://localhost:4566 s3 ls s3://transcripts/
```

### Playwright Issues

```bash
# Reinstall browsers
pnpm --filter e2e exec playwright install --with-deps

# Clear Playwright cache
rm -rf packages/e2e/test-results/
rm -rf packages/e2e/playwright-report/
```

### Backend Connection Issues

```bash
# Check backend health
curl http://localhost:3000/health

# Check backend logs
tail -f packages/backend/backend.log
```

## Test Coverage Goals

- ✅ Basic transcript loading
- ✅ Subagent reference display
- ✅ Error handling (404, 500)
- ✅ S3 integration via LocalStack
- ✅ Backend API validation
- ⏳ Subagent transcript navigation (future)
- ⏳ Search and filtering (future)
