import express from 'express';
import cors from 'cors';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const app = express();
const PORT = process.env.PORT || 3001;

// S3 Client configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// List transcripts from S3
app.get('/api/transcripts', async (_req, res) => {
  try {
    const bucketName = process.env.S3_BUCKET_NAME || 'transcripts';
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'transcripts/',
    });

    const response = await s3Client.send(command);
    const files = response.Contents?.map((item) => ({
      key: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
    })) || [];

    res.json({ files });
  } catch (error) {
    console.error('Error listing transcripts:', error);
    res.status(500).json({ error: 'Failed to list transcripts' });
  }
});

// Get specific transcript from S3
app.get('/api/transcripts/:key(*)', async (req, res) => {
  try {
    const bucketName = process.env.S3_BUCKET_NAME || 'transcripts';
    const key = req.params.key;

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.send(body);
  } catch (error) {
    console.error('Error getting transcript:', error);
    res.status(500).json({ error: 'Failed to get transcript' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
