import { Router, Request, Response } from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const router = Router();

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const TEST_BUCKET = process.env.S3_BUCKET || 'test-transcripts';
const USE_LOCALSTACK = process.env.USE_LOCALSTACK !== 'false';

const s3Client = new S3Client(
  USE_LOCALSTACK
    ? {
        endpoint: LOCALSTACK_ENDPOINT,
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test',
          secretAccessKey: 'test',
        },
        forcePathStyle: true,
      }
    : {
        region: process.env.AWS_REGION || 'us-east-1',
      }
);

interface TranscriptMessage {
  type: string;
  content: string;
  timestamp?: string;
  subagent?: string;
  agent?: string;
  tool?: string;
}

// GET /api/transcripts/:id
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Map transcript ID to S3 key
    const key = `${id}.jsonl`;

    const command = new GetObjectCommand({
      Bucket: TEST_BUCKET,
      Key: key,
    });

    const response = await s3Client.send(command);
    const bodyText = await response.Body?.transformToString();

    if (!bodyText) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    // Parse JSONL format (one JSON object per line)
    const lines = bodyText.trim().split('\n');
    const messages: TranscriptMessage[] = lines
      .filter(line => line.trim())
      .map(line => JSON.parse(line));

    res.json({
      id,
      messages,
    });
  } catch (error) {
    console.error('Error fetching transcript:', error);

    if (error instanceof Error && error.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    res.status(500).json({
      error: 'Failed to load transcript',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
