/**
 * LocalStack S3 Setup Script
 * Creates test bucket and uploads fixture files
 */
import { S3Client, CreateBucketCommand, PutObjectCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const TEST_BUCKET = 'test-transcripts';

const s3Client = new S3Client({
  endpoint: LOCALSTACK_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
  forcePathStyle: true,
});

async function setupLocalStack() {
  try {
    console.log('Setting up LocalStack S3...');

    // Check if bucket exists
    const listBucketsCommand = new ListBucketsCommand({});
    const listResponse = await s3Client.send(listBucketsCommand);
    const bucketExists = listResponse.Buckets?.some(b => b.Name === TEST_BUCKET);

    if (!bucketExists) {
      console.log(`Creating bucket: ${TEST_BUCKET}`);
      const createBucketCommand = new CreateBucketCommand({
        Bucket: TEST_BUCKET,
      });
      await s3Client.send(createBucketCommand);
      console.log('Bucket created successfully');
    } else {
      console.log(`Bucket ${TEST_BUCKET} already exists`);
    }

    // Upload fixture files
    const fixtures = [
      { key: 'main-transcript.jsonl', file: 'main-transcript.jsonl' },
      { key: 'subagent-transcript.jsonl', file: 'subagent-transcript.jsonl' },
    ];

    for (const fixture of fixtures) {
      console.log(`Uploading ${fixture.key}...`);
      const filePath = join(__dirname, '..', 'fixtures', fixture.file);
      const fileContent = readFileSync(filePath, 'utf-8');

      const putCommand = new PutObjectCommand({
        Bucket: TEST_BUCKET,
        Key: fixture.key,
        Body: fileContent,
        ContentType: 'application/jsonl',
      });

      await s3Client.send(putCommand);
      console.log(`${fixture.key} uploaded successfully`);
    }

    console.log('LocalStack S3 setup completed successfully!');
  } catch (error) {
    console.error('Error setting up LocalStack:', error);
    process.exit(1);
  }
}

setupLocalStack();
