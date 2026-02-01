# E2E Tests for Claude Transcript Viewer

End-to-end tests using Playwright and LocalStack for the Claude Transcript Viewer application.

## Setup

Install dependencies:

```bash
npm install
```

Install Playwright browsers:

```bash
npm run install-browsers
```

## Running Tests

### Local Development

Run all tests:

```bash
npm test
```

Run tests in UI mode (interactive):

```bash
npm run test:ui
```

Run tests in headed mode (see browser):

```bash
npm run test:headed
```

Debug tests:

```bash
npm run test:debug
```

### Prerequisites for Local Testing

1. **LocalStack**: Start LocalStack S3 service

```bash
docker run -d -p 4566:4566 \
  -e SERVICES=s3 \
  -e DEBUG=1 \
  localstack/localstack:latest
```

2. **Frontend**: Start the frontend dev server (in `../frontend`)

```bash
cd ../frontend
npm run dev
```

3. **Backend**: Start the backend proxy server (in `../backend`)

```bash
cd ../backend
npm run start
```

## Test Structure

```
e2e/
├── fixtures/
│   ├── data/                      # Sample JSONL test data
│   │   ├── main-transcript.jsonl
│   │   └── subagent-transcript.jsonl
│   └── test-fixtures.ts           # Playwright fixtures with S3 setup
├── tests/
│   └── transcript-viewer.spec.ts  # E2E test cases
├── playwright.config.ts           # Playwright configuration
├── package.json
└── tsconfig.json
```

## Test Coverage

### Basic Functionality
- Application loading and title display
- Main transcript loading and message display
- Message content rendering
- Timestamp formatting

### Tool Use Messages
- Tool use message display
- Tool result linking
- Expandable tool input

### Subagent Transcripts
- Subagent indicator display
- Parent task ID display
- Navigation between main and subagent transcripts

### Error Handling
- Transcript not found errors
- Bucket not found errors
- Invalid JSONL format handling

### UI Interactions
- Message search functionality
- Message type filtering
- Message count display

### Mobile Responsiveness
- Mobile viewport compatibility
- Touch-friendly controls

## CI/CD

Tests run automatically on GitHub Actions with:
- LocalStack service for S3 simulation
- Playwright browsers installed with dependencies
- Test reports uploaded as artifacts

See `.github/workflows/ci.yml` for details.

## Environment Variables

- `LOCALSTACK_ENDPOINT`: LocalStack endpoint URL (default: `http://localhost:4566`)
- `BASE_URL`: Frontend application URL (default: `http://localhost:5173`)
- `CI`: Set to `true` in CI environment

## Test Fixtures

The test fixtures provide:
- **S3Client**: Pre-configured AWS S3 client for LocalStack
- **bucketName**: Unique bucket name per test
- **mainTranscriptKey**: S3 key for main transcript
- **subagentTranscriptKey**: S3 key for subagent transcript
- **loadSampleData**: Function to load sample JSONL files into S3

Each test gets an isolated S3 bucket to ensure test independence.

## Debugging

View test report:

```bash
npm run report
```

This opens an HTML report showing test results, screenshots, and videos.

## Notes

- Tests use test-scoped fixtures for isolation
- Sample JSONL data is loaded fresh for each test
- LocalStack provides S3 emulation without AWS costs
- Tests are designed to fail initially (TDD Red Phase) until implementation is complete
