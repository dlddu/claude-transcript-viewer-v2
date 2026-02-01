/**
 * Setup script to upload test fixtures to LocalStack S3
 * This runs before E2E tests to prepare the test environment
 */

import { S3Client, CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const BUCKET_NAME = 'claude-transcripts';

async function setupS3Fixtures() {
  // Configure S3 client for LocalStack
  const s3Client = new S3Client({
    endpoint: LOCALSTACK_ENDPOINT,
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
    forcePathStyle: true,
  });

  try {
    // Create bucket
    console.log(`Creating bucket: ${BUCKET_NAME}`);
    await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
    console.log('Bucket created successfully');

    // Upload fixtures
    const fixturesDir = path.join(__dirname, '../fixtures');
    const fixtures = [
      'sample-main-transcript.jsonl',
      'sample-subagent-transcript.jsonl',
    ];

    for (const fixture of fixtures) {
      const filePath = path.join(fixturesDir, fixture);
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      console.log(`Uploading fixture: ${fixture}`);
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `transcripts/${fixture}`,
        Body: fileContent,
        ContentType: 'application/jsonl',
      }));
      console.log(`Uploaded: ${fixture}`);
    }

    console.log('All fixtures uploaded successfully');
  } catch (error) {
    console.error('Error setting up fixtures:', error);
    throw error;
  }
}

setupS3Fixtures();
