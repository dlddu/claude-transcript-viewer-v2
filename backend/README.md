# Backend - Transcript API Server

Node.js + Express + TypeScript backend serving as an S3 proxy for transcript data.

## Features (To Be Implemented)

- S3 proxy endpoints for transcript retrieval
- JSONL parsing and transformation
- Health check endpoint
- CORS support for frontend

## Development

```bash
# Install dependencies
npm install

# Run dev server with hot reload
npm run dev

# Run tests
npm test

# Build for production
npm run build
npm start
```

## API Endpoints (To Be Implemented)

### GET /api/transcript/:id

Fetches a transcript from S3 and returns parsed events.

**Response:**
```json
{
  "events": [
    {
      "type": "user_message",
      "timestamp": "2026-02-01T10:00:00Z",
      "content": "..."
    }
  ]
}
```

### GET /api/transcript/:id/subagent/:subagentId

Fetches a subagent transcript.

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "s3": "connected"
}
```

## Environment Variables

See `.env.example` for configuration options.

## Testing

Tests use Vitest with mocked AWS SDK:

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Architecture

```
src/
├── routes/             # Express route handlers
│   └── __tests__/
├── services/           # Business logic
│   ├── s3.service.ts
│   └── __tests__/
├── middleware/         # Express middleware
├── types/              # TypeScript types
└── index.ts            # App entry point
```

## Status

**TDD Red Phase**: All tests are currently failing as the API is not yet implemented.
