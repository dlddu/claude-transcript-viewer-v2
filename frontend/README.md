# Frontend - Transcript Viewer UI

React + Vite + TypeScript frontend for viewing Claude transcripts.

## Features (To Be Implemented)

- Timeline view of transcript events
- Expandable subagent transcripts
- Real-time loading states
- Error handling and user feedback

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build for production
npm run build
```

## Testing

Tests are written using Vitest and React Testing Library:

- Component tests: `src/components/__tests__/`
- Hook tests: `src/hooks/__tests__/`

Run tests with coverage:

```bash
npm run test:coverage
```

## Architecture

```
src/
├── components/          # React components
│   ├── TranscriptTimeline.tsx
│   ├── SubagentDetails.tsx
│   └── __tests__/
├── hooks/              # Custom React hooks
│   ├── useTranscript.ts
│   └── __tests__/
├── pages/              # Page components
├── types/              # TypeScript types
└── App.tsx             # Main app component
```

## Status

**TDD Red Phase**: All tests are currently failing as components are not yet implemented.
