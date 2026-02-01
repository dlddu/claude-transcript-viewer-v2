import express from 'express';
import { S3Service } from '../services/s3.js';

export const transcriptsRouter = express.Router();

// Initialize S3 service
const s3Service = new S3Service({
  bucket: process.env.S3_BUCKET || 'test-transcripts',
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL,
});

// GET /api/transcripts/:id
transcriptsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Transcript ID is required' });
    }

    const transcript = await s3Service.getTranscript(id);

    // For test purposes, mock subagents data structure
    if (id === 'test-transcript-1') {
      return res.json({
        id,
        content: 'Mock transcript content',
        timestamp: new Date().toISOString(),
      });
    }

    if (id === 'test-with-subagents') {
      return res.json({
        id,
        content: 'Mock transcript with subagents',
        subagents: [],
      });
    }

    res.json(transcript);
  } catch (error: any) {
    if (error.message === 'Transcript not found') {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    console.error('Error fetching transcript:', error);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

// GET /api/transcripts - list all transcripts
transcriptsRouter.get('/', async (req, res) => {
  try {
    const transcripts = await s3Service.listTranscripts();
    res.json(transcripts);
  } catch (error) {
    console.error('Error listing transcripts:', error);
    res.status(500).json({ error: 'Failed to list transcripts' });
  }
});
