# E2E Tests

End-to-end tests for Claude Transcript Viewer using Playwright.

## Setup

```bash
npm install
npm run setup-localstack  # Run LocalStack setup (requires LocalStack running)
```

## Running Tests

```bash
# Run all tests (headless)
npm test

# Run tests with UI
npm run test:ui

# Run tests in headed mode
npm run test:headed

# Debug tests
npm run test:debug
```

## Test Structure

- `tests/smoke.spec.ts` - Basic smoke tests to verify app loads
- `tests/localstack-s3.spec.ts` - LocalStack S3 integration tests
- `tests/transcript-viewer.spec.ts` - Main transcript viewer functionality tests

## Fixtures

Test fixtures are located in `fixtures/`:
- `main-transcript.jsonl` - Sample main conversation transcript
- `subagent-transcript.jsonl` - Sample subagent execution transcript

## CI Integration

Tests run automatically in GitHub Actions with:
- LocalStack service container for S3
- Playwright for E2E testing
- Test reports uploaded as artifacts

## Environment Variables

- `LOCALSTACK_ENDPOINT` - LocalStack endpoint URL (default: http://localhost:4566)
- `BASE_URL` - Application base URL (default: http://localhost:5173)
- `CI` - Set to `true` in CI environment
