import express, { Express } from 'express';
import cors from 'cors';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const app: Express = express();
const port = process.env.PORT || 3000;

// Configure S3 client (supports LocalStack)
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      }
    : undefined,
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'transcripts';

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get transcript from S3
app.get('/api/transcript/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    // Validate filename to prevent path traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filename,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const bodyContents = await response.Body.transformToString();

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.send(bodyContents);
  } catch (error: unknown) {
    console.error('Error fetching transcript:', error);

    if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
  console.log(`S3 Endpoint: ${process.env.S3_ENDPOINT || 'AWS Default'}`);
  console.log(`S3 Bucket: ${BUCKET_NAME}`);
});

export default app;
