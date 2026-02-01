#!/bin/bash

echo "Initializing S3 bucket for transcripts..."

# Create bucket
awslocal s3 mb s3://transcripts

# Upload test fixtures
echo "Uploading test transcript files..."

awslocal s3 cp /etc/localstack/init/ready.d/fixtures/main-transcript.jsonl s3://transcripts/transcripts/main-transcript.jsonl
awslocal s3 cp /etc/localstack/init/ready.d/fixtures/subagent-transcript.jsonl s3://transcripts/transcripts/subagent-transcript.jsonl
awslocal s3 cp /etc/localstack/init/ready.d/fixtures/test-writer-subagent.jsonl s3://transcripts/transcripts/test-writer-subagent.jsonl

# List bucket contents
echo "Bucket contents:"
awslocal s3 ls s3://transcripts/transcripts/

echo "S3 initialization complete!"
