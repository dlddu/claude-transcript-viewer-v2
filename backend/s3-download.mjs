import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs';
import path from 'path';

const proxyUrl = process.env.HTTPS_PROXY;
const agent = new HttpsProxyAgent(proxyUrl);

const sessionId = process.argv[2] || process.env.SESSION_ID;
const bucketName = process.env.S3_BUCKET || 'dlddu-kubernetes-claude-transcript';

if (!sessionId) {
  console.error('Usage: node s3-download.mjs <session-id>');
  console.error('Or set SESSION_ID environment variable');
  process.exit(1);
}

const clientConfig = {
  region: process.env.AWS_REGION || 'ap-northeast-2',
  requestHandler: new NodeHttpHandler({
    httpsAgent: agent,
    httpAgent: agent
  })
};

// Use environment variables for credentials if available
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  };
}

const client = new S3Client(clientConfig);

// List objects with session ID prefix
console.log('Searching for session:', sessionId);
const result = await client.send(new ListObjectsV2Command({
  Bucket: bucketName,
  Prefix: sessionId,
  MaxKeys: 100
}));

console.log('Found', result.Contents?.length || 0, 'objects:');
result.Contents?.forEach(obj => {
  console.log('  -', obj.Key, '(', obj.Size, 'bytes)');
});

// Create output directory
const outputDir = process.env.OUTPUT_DIR || './s3-download/' + sessionId;
fs.mkdirSync(outputDir, { recursive: true });

// Download all files
console.log('\nDownloading files to:', outputDir);
for (const obj of result.Contents || []) {
  if (!obj.Key) continue;

  try {
    const getResult = await client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: obj.Key
    }));
    const body = await getResult.Body?.transformToString();

    const fileName = obj.Key.includes('/') ? obj.Key.split('/').pop() : obj.Key;
    const filePath = path.join(outputDir, fileName);
    fs.writeFileSync(filePath, body);
    console.log('  Downloaded:', fileName);
  } catch (e) {
    console.log('  Error:', obj.Key, '-', e.message);
  }
}

console.log('\nDone!');
