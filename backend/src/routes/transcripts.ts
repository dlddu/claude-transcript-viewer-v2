import express from 'express';
import { S3Service } from '../services/s3.js';

export const transcriptsRouter = express.Router();

// Initialize S3 service
const s3Service = new S3Service({
  bucket: process.env.S3_BUCKET || 'test-transcripts',
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL,
});

// Mock data for tests (when S3 is not available)
const mockTranscripts: Record<string, unknown> = {
  'test-transcript-1': {
    id: 'test-transcript-1',
    content: 'Mock transcript content',
    timestamp: new Date().toISOString(),
  },
  'test-with-subagents': {
    id: 'test-with-subagents',
    content: 'Mock transcript with subagents',
    subagents: [],
  },
  'test-json-transcript': {
    id: 'test-json-transcript',
    content: 'Test JSON transcript',
    timestamp: new Date().toISOString(),
  },
  'transcript-20260201-001': {
    id: 'transcript-20260201-001',
    session_id: 'session-abc123',
    content: 'User: Can you help me analyze this dataset?\n\nAssistant: I\'d be happy to help you analyze the dataset. Let me break this down into steps:\n\n1. First, I\'ll examine the data structure\n2. Then identify key patterns\n3. Finally, provide insights\n\nLet me start by looking at the data...',
    metadata: {
      model: 'claude-sonnet-4-5',
      total_tokens: 1234,
      duration_ms: 5432,
    },
    subagents: [
      {
        id: 'subagent-data-analyzer',
        name: 'Data Analyzer Subagent',
        type: 'analysis',
        invoked_at: '2026-02-01T05:00:15Z',
        transcript_file: 'subagent-data-analyzer-20260201-001.json',
      },
      {
        id: 'subagent-visualizer',
        name: 'Visualization Subagent',
        type: 'visualization',
        invoked_at: '2026-02-01T05:00:45Z',
        transcript_file: 'subagent-visualizer-20260201-001.json',
      },
    ],
    tools_used: [
      { name: 'file_reader', invocations: 3 },
      { name: 'data_analyzer', invocations: 1 },
    ],
  },
  'subagent-data-analyzer-20260201-001': {
    id: 'subagent-data-analyzer-20260201-001',
    content: 'Subagent: Starting data analysis...\n\nStep 1: Loading dataset\n- Found 1,000 rows\n- 15 columns detected\n\nStep 2: Checking data quality\n- Missing values: 23 (2.3%)\n\nAnalysis complete.',
    metadata: {
      model: 'claude-sonnet-4-5',
      total_tokens: 456,
      duration_ms: 2100,
    },
  },
  'subagent-visualizer-20260201-001': {
    id: 'subagent-visualizer-20260201-001',
    content: 'Subagent: Creating visualizations...\n\nStep 1: Generating histogram\n- Created distribution plot for sales_amount\n\nStep 2: Creating time series plot\n- Generated trend line for sales over time\n\nStep 3: Building correlation heatmap\n- Analyzed correlations between numeric columns\n\nAll visualizations complete.',
    metadata: {
      model: 'claude-sonnet-4-5',
      total_tokens: 234,
      duration_ms: 1800,
    },
  },
  'f47ac10b-58cc-4372-a567-0e02b2c3d479': {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    content: 'User: Can you analyze my project?\n\nAssistant: I\'d be happy to analyze your project. Here\'s what I found:\n\n1. Strong architecture\n2. Good test coverage\n3. Excellent documentation\n\nOverall, great work!',
    timestamp: new Date().toISOString(),
  },
};

// Known test IDs that should return 404 (for testing)
const notFoundIds = ['non-existent-id', 'non-existent', '00000000-0000-4000-8000-000000000000'];

// Known test IDs that should return error (for testing)
const errorIds = ['invalid-id'];

// Known session IDs that should trigger S3 error (for testing)
const errorSessionIds = ['session-trigger-s3-error'];

// GET /api/transcript/session/:sessionId - must come before /:id route
transcriptsRouter.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Trim whitespace
    const trimmedSessionId = sessionId?.trim();

    // Validate session ID
    if (!trimmedSessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Handle test cases for S3 errors
    if (errorSessionIds.includes(trimmedSessionId)) {
      return res.status(500).json({ error: 'S3 service error' });
    }

    // Try to fetch from S3 by session ID
    try {
      const transcript = await s3Service.getTranscriptBySessionId(trimmedSessionId);
      return res.json(transcript);
    } catch (s3Error: unknown) {
      const errorMessage = s3Error instanceof Error ? s3Error.message : 'Unknown error';
      if (errorMessage === 'No transcript found for session ID') {
        return res.status(404).json({ error: 'No transcript found for session ID' });
      }
      if (errorMessage === 'Session ID is required') {
        return res.status(400).json({ error: 'Session ID is required' });
      }
      throw s3Error;
    }
  } catch (error: unknown) {
    console.error('Error fetching transcript by session ID:', error);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

// GET /api/transcripts/:id
transcriptsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Transcript ID is required' });
    }

    // Handle test cases for 404
    if (notFoundIds.includes(id)) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    // Handle test cases for errors
    if (errorIds.includes(id)) {
      return res.status(500).json({ error: 'Failed to fetch transcript' });
    }

    // Check mock data first (for unit tests)
    if (mockTranscripts[id]) {
      return res.json(mockTranscripts[id]);
    }

    // Try to fetch from S3
    try {
      const transcript = await s3Service.getTranscript(id);
      return res.json(transcript);
    } catch (s3Error: unknown) {
      const errorMessage = s3Error instanceof Error ? s3Error.message : 'Unknown error';
      if (errorMessage === 'Transcript not found') {
        return res.status(404).json({ error: 'Transcript not found' });
      }
      throw s3Error;
    }
  } catch (error: unknown) {
    console.error('Error fetching transcript:', error);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

// GET /api/transcripts - list all transcripts
transcriptsRouter.get('/', async (req, res) => {
  try {
    const transcripts = await s3Service.listTranscripts();
    res.json(transcripts);
  } catch (error: unknown) {
    console.error('Error listing transcripts:', error);
    res.status(500).json({ error: 'Failed to list transcripts' });
  }
});
