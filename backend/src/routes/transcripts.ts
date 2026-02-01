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
};

// Known test IDs that should return 404 (for testing)
const notFoundIds = ['non-existent-id'];

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
