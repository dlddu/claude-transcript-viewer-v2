# Project Structure

```
claude-transcript-viewer-v2/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # CI workflow (lint, typecheck, build)
│       └── e2e.yml                   # E2E tests with LocalStack
│
├── frontend/                         # React + Vite workspace
│   ├── src/
│   │   ├── App.tsx                   # Main App component
│   │   └── main.tsx                  # Entry point
│   ├── index.html                    # HTML template
│   ├── package.json                  # Frontend dependencies
│   ├── tsconfig.json                 # TypeScript config (extends root)
│   ├── tsconfig.node.json            # Node TypeScript config
│   └── vite.config.ts                # Vite configuration
│
├── backend/                          # Node.js + Express workspace
│   ├── src/
│   │   └── server.ts                 # Express server + S3 proxy
│   ├── package.json                  # Backend dependencies
│   └── tsconfig.json                 # TypeScript config (extends root)
│
├── e2e/                              # Playwright E2E tests workspace
│   ├── tests/
│   │   ├── transcript-viewer.spec.ts # Main UI tests
│   │   └── s3-integration.spec.ts    # S3 API integration tests
│   ├── fixtures/
│   │   └── transcripts/
│   │       ├── main-transcript.jsonl         # Sample main transcript
│   │       ├── subagent-transcript.jsonl     # Sample subagent transcript
│   │       └── test-writer-subagent.jsonl    # Sample test-writer transcript
│   ├── package.json                  # E2E dependencies
│   ├── playwright.config.ts          # Playwright configuration
│   └── tsconfig.json                 # TypeScript config (extends root)
│
├── localstack-init/                  # LocalStack initialization
│   ├── fixtures/                     # Copies of test transcripts
│   │   ├── main-transcript.jsonl
│   │   ├── subagent-transcript.jsonl
│   │   └── test-writer-subagent.jsonl
│   └── init-s3.sh                    # S3 bucket setup script
│
├── .env                              # Environment variables (gitignored)
├── .env.example                      # Environment variables template
├── .eslintrc.json                    # ESLint configuration
├── .gitignore                        # Git ignore patterns
├── .prettierrc.json                  # Prettier configuration
├── .prettierignore                   # Prettier ignore patterns
├── docker-compose.yml                # LocalStack service definition
├── package.json                      # Root package.json (workspaces)
├── PROJECT_STRUCTURE.md              # This file
├── README.md                         # Project documentation
└── tsconfig.json                     # Root TypeScript configuration
```

## Workspace Dependencies

### Frontend Dependencies
- react
- react-dom
- vite
- @vitejs/plugin-react

### Backend Dependencies
- express
- cors
- @aws-sdk/client-s3
- tsx (dev)

### E2E Dependencies
- @playwright/test

### Root DevDependencies
- typescript
- eslint
- @typescript-eslint/eslint-plugin
- @typescript-eslint/parser
- prettier

## File Counts

- TypeScript files: 9
- Configuration files: 11
- Test files: 2
- JSONL fixtures: 6 (3 in e2e/fixtures, 3 in localstack-init/fixtures)
- Workflow files: 2
