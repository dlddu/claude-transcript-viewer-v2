//go:build integration

package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const testBucket = "test-transcripts"

func endpointFromEnv() string {
	if v := os.Getenv("AWS_ENDPOINT_URL"); v != "" {
		return v
	}
	return "http://localhost:9000"
}

func newRealS3Client(t *testing.T) *s3.Client {
	t.Helper()
	endpoint := endpointFromEnv()
	cfg, err := awsconfig.LoadDefaultConfig(context.Background(), awsconfig.WithRegion("us-east-1"))
	if err != nil {
		t.Fatalf("load aws config: %v", err)
	}
	cfg.Credentials = credentials.NewStaticCredentialsProvider(
		envOr("AWS_ACCESS_KEY_ID", "minioadmin"),
		envOr("AWS_SECRET_ACCESS_KEY", "minioadmin"),
		"",
	)
	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})
}

func putObject(t *testing.T, client *s3.Client, key, body string) {
	t.Helper()
	_, err := client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(testBucket),
		Key:         aws.String(key),
		Body:        strings.NewReader(body),
		ContentType: aws.String("application/json"),
	})
	if err != nil {
		t.Fatalf("put %s: %v", key, err)
	}
}

func deleteObject(t *testing.T, client *s3.Client, key string) {
	t.Helper()
	_, err := client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(testBucket),
		Key:    aws.String(key),
	})
	if err != nil {
		t.Logf("delete %s: %v", key, err)
	}
}

func readFixtureFile(t *testing.T, name string) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	b, err := os.ReadFile(filepath.Join(wd, "..", "e2e", "fixtures", name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return string(b)
}

func newIntegrationService(t *testing.T, prefix string) *S3Service {
	t.Helper()
	svc, err := NewS3Service(context.Background(), S3ServiceConfig{
		Bucket:   testBucket,
		Region:   "us-east-1",
		Endpoint: endpointFromEnv(),
		Prefix:   prefix,
	})
	if err != nil {
		t.Fatalf("NewS3Service: %v", err)
	}
	return svc
}

func TestIntegration_ListTranscriptsIncludesUploaded(t *testing.T) {
	client := newRealS3Client(t)
	const id = "session-xyz789"
	body := readFixtureFile(t, "session-xyz789.jsonl")

	putObject(t, client, id+".jsonl", body)
	t.Cleanup(func() { deleteObject(t, client, id+".jsonl") })

	svc := newIntegrationService(t, "")
	ids, err := svc.ListTranscripts(context.Background())
	if err != nil {
		t.Fatalf("ListTranscripts: %v", err)
	}
	found := false
	for _, gotID := range ids {
		if gotID == id {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected %q in %v", id, ids)
	}
}

func TestIntegration_GetTranscriptBySessionIdWithPrefix(t *testing.T) {
	client := newRealS3Client(t)
	prefix := "tenants/acme/transcripts/"
	id := "prefixed-session"
	body := readFixtureFile(t, "session-xyz789.jsonl")

	putObject(t, client, prefix+id+".jsonl", body)
	t.Cleanup(func() { deleteObject(t, client, prefix+id+".jsonl") })

	prefixedSvc := newIntegrationService(t, prefix)
	got, err := prefixedSvc.GetTranscriptBySessionId(context.Background(), id)
	if err != nil {
		t.Fatalf("GetTranscriptBySessionId: %v", err)
	}
	if got.GetString("session_id") != id {
		t.Errorf("session_id = %q, want %q", got.GetString("session_id"), id)
	}

	noPrefixSvc := newIntegrationService(t, "")
	_, err = noPrefixSvc.GetTranscriptBySessionId(context.Background(), id)
	if !errors.Is(err, ErrNoSessionTranscriptFound) {
		t.Errorf("expected ErrNoSessionTranscriptFound without prefix, got %v", err)
	}

	ids, err := prefixedSvc.ListTranscripts(context.Background())
	if err != nil {
		t.Fatalf("ListTranscripts: %v", err)
	}
	found := false
	for _, gotID := range ids {
		if strings.HasPrefix(gotID, prefix) {
			t.Errorf("listed id %q still contains prefix", gotID)
		}
		if gotID == id {
			found = true
		}
	}
	if !found {
		t.Errorf("expected %q in %v", id, ids)
	}
}
