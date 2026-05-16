import express from 'express';
import { S3Service } from '../services/s3.js';

export const transcriptsRouter = express.Router();

// Initialize S3 service
const assumeRoleDurationRaw = process.env.AWS_ASSUME_ROLE_DURATION_SECONDS;
const assumeRoleDurationSeconds = assumeRoleDurationRaw
  ? Number.parseInt(assumeRoleDurationRaw, 10)
  : undefined;

const s3Service = new S3Service({
  bucket: process.env.S3_BUCKET || 'test-transcripts',
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL,
  prefix: process.env.S3_PREFIX,
  assumeRoleArn: process.env.AWS_ASSUME_ROLE_ARN,
  assumeRoleSessionName: process.env.AWS_ASSUME_ROLE_SESSION_NAME,
  assumeRoleExternalId: process.env.AWS_ASSUME_ROLE_EXTERNAL_ID,
  assumeRoleDurationSeconds:
    assumeRoleDurationSeconds && Number.isFinite(assumeRoleDurationSeconds)
      ? assumeRoleDurationSeconds
      : undefined,
});

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

    try {
      const transcript = await s3Service.getTranscriptBySessionId(trimmedSessionId);
      return res.json(transcript);
    } catch (s3Error: unknown) {
      const errorMessage = s3Error instanceof Error ? s3Error.message : 'Unknown error';
      if (errorMessage === 'No transcript found for session ID') {
        return res.status(404).json({ error: 'Transcript not found' });
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
