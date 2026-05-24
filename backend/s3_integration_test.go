//go:build integration

package main

import (
	"context"
	"encoding/json"
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
	store, err := OpenSQLiteStore(filepath.Join(t.TempDir(), "transcripts.db"))
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	svc, err := NewS3Service(context.Background(), S3ServiceConfig{
		Bucket:   testBucket,
		Region:   "us-east-1",
		Endpoint: endpointFromEnv(),
		Prefix:   prefix,
	}, store)
	if err != nil {
		t.Fatalf("NewS3Service: %v", err)
	}
	return svc
}

func TestIntegration_UploadListGetRoundTrip(t *testing.T) {
	svc := newIntegrationService(t, "")
	const id = "session-xyz789"
	body := readFixtureFile(t, "session-xyz789.jsonl")

	key, err := svc.UploadTranscript(context.Background(), UploadInput{
		SessionID: id,
		Content:   []byte(body),
	})
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	t.Cleanup(func() { deleteObject(t, newRealS3Client(t), key) })

	if !strings.Contains(key, "year=") || !strings.HasSuffix(key, id+".jsonl") {
		t.Errorf("unexpected hive key: %q", key)
	}

	ids, err := svc.ListTranscripts(context.Background())
	if err != nil {
		t.Fatalf("ListTranscripts: %v", err)
	}
	found := false
	for _, gotID := range ids {
		if gotID == id {
			found = true
		}
	}
	if !found {
		t.Errorf("expected %q in %v", id, ids)
	}

	got, err := svc.GetTranscriptBySessionId(context.Background(), id)
	if err != nil {
		t.Fatalf("GetTranscriptBySessionId: %v", err)
	}
	if got.GetString("session_id") != id {
		t.Errorf("session_id = %q, want %q", got.GetString("session_id"), id)
	}
}

func TestIntegration_UploadWithSubagentsAndPrefix(t *testing.T) {
	prefix := "tenants/acme/transcripts/"
	svc := newIntegrationService(t, prefix)
	const id = "session-abc123"

	key, err := svc.UploadTranscript(context.Background(), UploadInput{
		SessionID: id,
		Content:   []byte(readFixtureFile(t, "session-abc123.jsonl")),
		Subagents: []SubagentUpload{
			{ID: "agent-a1b2c3d.jsonl", Content: []byte(readFixtureFile(t, "session-abc123/agent-a1b2c3d.jsonl"))},
			{ID: "agent-xyz789.jsonl", Content: []byte(readFixtureFile(t, "session-abc123/agent-xyz789.jsonl"))},
		},
	})
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	base := strings.TrimSuffix(key, ".jsonl")
	t.Cleanup(func() {
		client := newRealS3Client(t)
		deleteObject(t, client, key)
		deleteObject(t, client, base+"/agent-a1b2c3d.jsonl")
		deleteObject(t, client, base+"/agent-xyz789.jsonl")
	})

	if !strings.HasPrefix(key, prefix) {
		t.Errorf("key %q missing prefix %q", key, prefix)
	}

	got, err := svc.GetTranscriptBySessionId(context.Background(), id)
	if err != nil {
		t.Fatalf("GetTranscriptBySessionId: %v", err)
	}
	raw, ok := got["subagents"]
	if !ok {
		t.Fatal("expected subagents field")
	}
	var subs []SubagentTranscript
	if err := json.Unmarshal(raw, &subs); err != nil {
		t.Fatalf("subagents decode: %v", err)
	}
	if len(subs) != 2 {
		t.Errorf("expected 2 subagents, got %d", len(subs))
	}

	// A service without the prefix must not resolve the prefixed object.
	noPrefix := newIntegrationService(t, "")
	if _, err := noPrefix.GetTranscriptBySessionId(context.Background(), id); !errors.Is(err, ErrNoSessionTranscriptFound) {
		t.Errorf("expected ErrNoSessionTranscriptFound from empty store, got %v", err)
	}
}
