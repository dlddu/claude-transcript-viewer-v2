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

func TestIntegration_GetTranscript(t *testing.T) {
	client := newRealS3Client(t)
	body := readFixtureFile(t, "transcript-20260201-001.json")

	var meta struct {
		ID      string `json:"id"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal([]byte(body), &meta); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}

	key := meta.ID + ".json"
	putObject(t, client, key, body)
	t.Cleanup(func() { deleteObject(t, client, key) })

	svc := newIntegrationService(t, "")
	got, err := svc.GetTranscript(context.Background(), meta.ID)
	if err != nil {
		t.Fatalf("GetTranscript: %v", err)
	}
	if got.GetString("id") != meta.ID {
		t.Errorf("id = %q, want %q", got.GetString("id"), meta.ID)
	}
	if got.GetString("content") != meta.Content {
		t.Errorf("content mismatch")
	}
	if _, ok := got["subagents"]; !ok {
		t.Error("missing subagents field from fixture")
	}
}

func TestIntegration_ListTranscriptsIncludesUploaded(t *testing.T) {
	client := newRealS3Client(t)
	body := readFixtureFile(t, "transcript-20260201-001.json")

	var meta struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(body), &meta); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}

	putObject(t, client, meta.ID+".json", body)
	t.Cleanup(func() { deleteObject(t, client, meta.ID+".json") })

	svc := newIntegrationService(t, "")
	ids, err := svc.ListTranscripts(context.Background())
	if err != nil {
		t.Fatalf("ListTranscripts: %v", err)
	}
	found := false
	for _, id := range ids {
		if id == meta.ID {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected %q in %v", meta.ID, ids)
	}
}

func TestIntegration_GetTranscriptWithPrefix(t *testing.T) {
	client := newRealS3Client(t)
	prefix := "tenants/acme/transcripts/"
	id := "prefixed-integration-transcript"
	body, _ := json.Marshal(map[string]any{
		"id":        id,
		"content":   "Prefixed transcript content for integration testing",
		"timestamp": "2026-02-01T00:00:00Z",
	})

	putObject(t, client, prefix+id+".json", string(body))
	t.Cleanup(func() { deleteObject(t, client, prefix+id+".json") })

	prefixedSvc := newIntegrationService(t, prefix)
	got, err := prefixedSvc.GetTranscript(context.Background(), id)
	if err != nil {
		t.Fatalf("GetTranscript: %v", err)
	}
	if got.GetString("id") != id {
		t.Errorf("id = %q, want %q", got.GetString("id"), id)
	}
	if !strings.Contains(got.GetString("content"), "Prefixed transcript content") {
		t.Errorf("content missing expected substring, got %q", got.GetString("content"))
	}

	noPrefixSvc := newIntegrationService(t, "")
	_, err = noPrefixSvc.GetTranscript(context.Background(), id)
	if !errors.Is(err, ErrTranscriptNotFound) {
		t.Errorf("expected ErrTranscriptNotFound without prefix, got %v", err)
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
