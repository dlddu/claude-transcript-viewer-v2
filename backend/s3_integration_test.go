//go:build integration

package main

import (
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

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

func newIntegrationStore(t *testing.T) *Store {
	t.Helper()
	store, err := OpenStore(context.Background(), filepath.Join(t.TempDir(), "integration.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { store.Close() })
	return store
}

func newIntegrationService(t *testing.T, store SessionStore, prefix string) *S3Service {
	t.Helper()
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

func TestIntegration_GetTranscriptViaMapping(t *testing.T) {
	client := newRealS3Client(t)
	store := newIntegrationStore(t)
	svc := newIntegrationService(t, store, "")

	sessionID := "session-xyz789"
	prefix := hiveSessionPrefix(sessionID, time.Now())
	mainKey := prefix + mainTranscriptName(sessionID)
	putObject(t, client, mainKey, readFixtureFile(t, "session-xyz789.jsonl"))
	t.Cleanup(func() { deleteObject(t, client, mainKey) })
	if err := store.PutSession(context.Background(), sessionID, prefix); err != nil {
		t.Fatalf("put session: %v", err)
	}

	got, err := svc.GetTranscriptBySessionId(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("GetTranscriptBySessionId: %v", err)
	}
	if got.GetString("session_id") != sessionID {
		t.Errorf("session_id = %q, want %q", got.GetString("session_id"), sessionID)
	}

	ids, err := svc.ListTranscripts(context.Background())
	if err != nil {
		t.Fatalf("ListTranscripts: %v", err)
	}
	found := false
	for _, id := range ids {
		if id == sessionID {
			found = true
		}
	}
	if !found {
		t.Errorf("expected %q in %v", sessionID, ids)
	}
}

func TestIntegration_GetTranscriptWithConfiguredPrefix(t *testing.T) {
	client := newRealS3Client(t)
	store := newIntegrationStore(t)
	const configuredPrefix = "tenants/acme/transcripts/"
	svc := newIntegrationService(t, store, configuredPrefix)

	sessionID := "prefixed-session"
	prefix := configuredPrefix + hiveSessionPrefix(sessionID, time.Now())
	mainKey := prefix + mainTranscriptName(sessionID)
	putObject(t, client, mainKey, readFixtureFile(t, "session-xyz789.jsonl"))
	t.Cleanup(func() { deleteObject(t, client, mainKey) })
	if err := store.PutSession(context.Background(), sessionID, prefix); err != nil {
		t.Fatalf("put session: %v", err)
	}

	got, err := svc.GetTranscriptBySessionId(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("GetTranscriptBySessionId: %v", err)
	}
	if got.GetString("session_id") != sessionID {
		t.Errorf("session_id = %q, want %q", got.GetString("session_id"), sessionID)
	}
}

// TestIntegration_UploadURLRoundTrip exercises the full new feature: request a
// presigned URL, PUT a transcript to it, then read it back via the mapping.
func TestIntegration_UploadURLRoundTrip(t *testing.T) {
	client := newRealS3Client(t)
	store := newIntegrationStore(t)
	svc := newIntegrationService(t, store, "")

	sessionID := "presigned-roundtrip"
	resp, err := svc.CreateUploadURL(context.Background(), UploadURLRequest{SessionID: sessionID})
	if err != nil {
		t.Fatalf("CreateUploadURL: %v", err)
	}
	t.Cleanup(func() { deleteObject(t, client, resp.Key) })

	body := readFixtureFile(t, "session-xyz789.jsonl")
	req, err := http.NewRequest(http.MethodPut, resp.URL, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	httpResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("PUT to presigned URL: %v", err)
	}
	defer httpResp.Body.Close()
	if httpResp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(httpResp.Body)
		t.Fatalf("presigned PUT status = %d, body=%s", httpResp.StatusCode, string(b))
	}

	got, err := svc.GetTranscriptBySessionId(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("GetTranscriptBySessionId after upload: %v", err)
	}
	if got.GetString("session_id") != sessionID {
		t.Errorf("session_id = %q, want %q", got.GetString("session_id"), sessionID)
	}
	if len(decodeMessages(t, got)) == 0 {
		t.Error("expected messages after round-trip upload")
	}
}
