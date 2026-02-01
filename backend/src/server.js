import express from 'express';
import cors from 'cors';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const app = express();
const port = process.env.PORT || 3000;

// Configure CORS
app.use(cors());

// Configure S3 client
const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
  forcePathStyle: true,
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Transcript endpoint - proxy to S3
app.get('/api/transcript', async (req, res) => {
  const { bucket, key } = req.query;

  if (!bucket || !key) {
    return res.status(400).json({ error: 'Missing bucket or key parameter' });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3Client.send(command);

    // Stream the response from S3
    if (response.Body) {
      res.setHeader('Content-Type', 'application/jsonl');

      // Convert the stream to string
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const text = Buffer.concat(chunks).toString('utf-8');

      res.send(text);
    } else {
      res.status(404).json({ error: 'Transcript not found' });
    }
  } catch (error) {
    console.error('Error fetching transcript:', error);

    // Handle specific S3 errors
    if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    if (error.name === 'NoSuchBucket' || error.Code === 'NoSuchBucket') {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    res.status(500).json({ error: 'Error loading transcript' });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
  console.log(`S3 Endpoint: ${process.env.S3_ENDPOINT || process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566'}`);
});
