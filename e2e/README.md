# E2E Tests - Playwright

End-to-end tests using Playwright with LocalStack S3.

## Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Setup test fixtures in LocalStack
npm run setup
```

## Running Tests

```bash
# Run all tests
npm test

# Run in UI mode
npm run test:ui

# Run in headed mode (see browser)
npm run test:headed

# Debug mode
npm run test:debug
```

## Test Fixtures

Sample transcript files in JSONL format:

- `fixtures/sample-main-transcript.jsonl` - Main agent transcript
- `fixtures/sample-subagent-transcript.jsonl` - Subagent transcript

These fixtures are uploaded to LocalStack S3 before tests run.

## Test Scenarios

1. **Basic Timeline Loading**: Verify transcript loads and displays in timeline
2. **Subagent Expansion**: Test clicking on subagent events to view details
3. **API Integration**: Verify backend API calls work correctly
4. **Error Handling**: Test missing transcript handling
5. **Loading States**: Verify loading indicators appear

## LocalStack Configuration

Tests expect LocalStack to be running on `http://localhost:4566` with S3 service enabled.

In CI, LocalStack runs as a GitHub Actions service.

## Status

**TDD Red Phase**: All tests are currently failing as the application is not yet implemented.
