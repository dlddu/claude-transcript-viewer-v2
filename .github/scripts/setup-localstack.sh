#!/bin/bash
set -e

echo "Setting up LocalStack S3..."

# Configuration
ENDPOINT_URL="${S3_ENDPOINT:-http://localhost:4566}"
BUCKET_NAME="${S3_BUCKET_NAME:-transcripts}"
REGION="${AWS_REGION:-us-east-1}"

# Wait for LocalStack to be ready
echo "Waiting for LocalStack to be ready..."
timeout 60 bash -c "until curl -f ${ENDPOINT_URL}/_localstack/health; do sleep 2; done"
echo "LocalStack is ready!"

# Create S3 bucket
echo "Creating S3 bucket: ${BUCKET_NAME}"
aws --endpoint-url="${ENDPOINT_URL}" s3 mb "s3://${BUCKET_NAME}" --region "${REGION}" || {
  echo "Bucket already exists or creation failed, continuing..."
}

# Upload test fixtures
echo "Uploading test fixtures..."
if [ -d "fixtures" ]; then
  aws --endpoint-url="${ENDPOINT_URL}" s3 cp fixtures/main-transcript.jsonl "s3://${BUCKET_NAME}/main-transcript.jsonl"
  aws --endpoint-url="${ENDPOINT_URL}" s3 cp fixtures/subagent-transcript.jsonl "s3://${BUCKET_NAME}/subagent-transcript.jsonl"
else
  echo "Warning: fixtures directory not found"
fi

# List bucket contents to verify
echo "Verifying bucket contents..."
aws --endpoint-url="${ENDPOINT_URL}" s3 ls "s3://${BUCKET_NAME}/"

echo "LocalStack setup complete!"
