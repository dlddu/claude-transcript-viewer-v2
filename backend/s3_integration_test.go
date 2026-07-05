//go:build integration

package main

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
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

func TestIntegration_TranscriptFilesViaMapping(t *testing.T) {
	client := newRealS3Client(t)
	store := newIntegrationStore(t)
	svc := newIntegrationService(t, store, "")

	sessionID := "session-xyz789"
	prefix := hiveSessionPrefix(sessionID, time.Now())
	mainKey := prefix + mainTranscriptName(sessionID)
	fixture := readFixtureFile(t, "session-xyz789.jsonl")
	putObject(t, client, mainKey, fixture)
	t.Cleanup(func() { deleteObject(t, client, mainKey) })
	if err := store.PutSession(context.Background(), sessionID, prefix); err != nil {
		t.Fatalf("put session: %v", err)
	}

	got, err := svc.GetTranscriptFiles(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("GetTranscriptFiles: %v", err)
	}
	if got.SessionID != sessionID {
		t.Errorf("session_id = %q, want %q", got.SessionID, sessionID)
	}
	if got.Main.Key != mainKey {
		t.Errorf("main key = %q, want %q", got.Main.Key, mainKey)
	}

	// The presigned URL must be usable without credentials and return the
	// exact bytes that were uploaded.
	body := getFromPresignedURL(t, got.Main.URL)
	if body != fixture {
		t.Errorf("downloaded body differs from fixture (%d vs %d bytes)", len(body), len(fixture))
	}

	sessions, err := svc.ListTranscripts(context.Background())
	if err != nil {
		t.Fatalf("ListTranscripts: %v", err)
	}
	found := false
	for _, s := range sessions {
		if s.SessionID == sessionID {
			found = true
		}
	}
	if !found {
		t.Errorf("expected %q in %v", sessionID, sessions)
	}
}

func TestIntegration_TranscriptFilesWithConfiguredPrefix(t *testing.T) {
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

	got, err := svc.GetTranscriptFiles(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("GetTranscriptFiles: %v", err)
	}
	if !strings.HasPrefix(got.Main.Key, configuredPrefix) {
		t.Errorf("main key = %q, want prefix %q", got.Main.Key, configuredPrefix)
	}
	if body := getFromPresignedURL(t, got.Main.URL); body == "" {
		t.Error("expected non-empty body from presigned URL")
	}
}

func TestIntegration_DownloadURLHonorsConfiguredTTL(t *testing.T) {
	client := newRealS3Client(t)
	store := newIntegrationStore(t)
	svc, err := NewS3Service(context.Background(), S3ServiceConfig{
		Bucket:         testBucket,
		Region:         "us-east-1",
		Endpoint:       endpointFromEnv(),
		DownloadURLTTL: 2 * time.Minute,
	}, store)
	if err != nil {
		t.Fatalf("NewS3Service: %v", err)
	}

	sessionID := "ttl-session"
	prefix := hiveSessionPrefix(sessionID, time.Now())
	mainKey := prefix + mainTranscriptName(sessionID)
	putObject(t, client, mainKey, readFixtureFile(t, "session-xyz789.jsonl"))
	t.Cleanup(func() { deleteObject(t, client, mainKey) })
	if err := store.PutSession(context.Background(), sessionID, prefix); err != nil {
		t.Fatalf("put session: %v", err)
	}

	got, err := svc.GetTranscriptFiles(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("GetTranscriptFiles: %v", err)
	}
	if got.ExpiresIn != 120 {
		t.Errorf("expires_in = %d, want 120", got.ExpiresIn)
	}
	u, err := url.Parse(got.Main.URL)
	if err != nil {
		t.Fatalf("parse presigned URL: %v", err)
	}
	if exp := u.Query().Get("X-Amz-Expires"); exp != "120" {
		t.Errorf("X-Amz-Expires = %q, want 120", exp)
	}
}

// TestIntegration_UploadURLRoundTrip exercises the full flow: request a
// presigned upload URL, PUT a transcript to it, then fetch the download
// manifest and GET the file back through its presigned URL.
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

	fixture := readFixtureFile(t, "session-xyz789.jsonl")
	putToPresignedURL(t, resp.URL, fixture)

	got, err := svc.GetTranscriptFiles(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("GetTranscriptFiles after upload: %v", err)
	}
	if got.SessionID != sessionID {
		t.Errorf("session_id = %q, want %q", got.SessionID, sessionID)
	}
	if body := getFromPresignedURL(t, got.Main.URL); body != fixture {
		t.Error("downloaded body differs from uploaded fixture")
	}
}

// TestIntegration_UploadSubagentRoundTrip uploads a main transcript and a
// subagent under subagents/ via presigned URLs, then verifies the subagent is
// discovered and downloadable through the manifest.
func TestIntegration_UploadSubagentRoundTrip(t *testing.T) {
	client := newRealS3Client(t)
	store := newIntegrationStore(t)
	svc := newIntegrationService(t, store, "")

	sessionID := "presigned-subagent"
	mainResp, err := svc.CreateUploadURL(context.Background(), UploadURLRequest{SessionID: sessionID})
	if err != nil {
		t.Fatalf("CreateUploadURL main: %v", err)
	}
	t.Cleanup(func() { deleteObject(t, client, mainResp.Key) })
	putToPresignedURL(t, mainResp.URL, readFixtureFile(t, "session-xyz789.jsonl"))

	subResp, err := svc.CreateUploadURL(context.Background(), UploadURLRequest{
		SessionID: sessionID,
		FileName:  "subagents/agent-a1b2c3d.jsonl",
	})
	if err != nil {
		t.Fatalf("CreateUploadURL subagent: %v", err)
	}
	t.Cleanup(func() { deleteObject(t, client, subResp.Key) })
	if !strings.Contains(subResp.Key, "/subagents/agent-a1b2c3d.jsonl") {
		t.Fatalf("subagent key %q not under subagents/", subResp.Key)
	}
	subFixture := readFixtureFile(t, "session-abc123/agent-a1b2c3d.jsonl")
	putToPresignedURL(t, subResp.URL, subFixture)

	got, err := svc.GetTranscriptFiles(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("GetTranscriptFiles: %v", err)
	}
	if len(got.Subagents) != 1 {
		t.Fatalf("expected 1 subagent, got %d", len(got.Subagents))
	}
	sub := got.Subagents[0]
	if sub.ID != "agent-a1b2c3d" {
		t.Errorf("subagent id = %q, want agent-a1b2c3d", sub.ID)
	}
	if body := getFromPresignedURL(t, sub.URL); body != subFixture {
		t.Error("downloaded subagent body differs from uploaded fixture")
	}
}

// TestIntegration_DeleteTranscriptRemovesAllFiles uploads a main transcript and
// a subagent, deletes the session, and verifies both the S3 objects and the
// SQLite mapping are gone.
func TestIntegration_DeleteTranscriptRemovesAllFiles(t *testing.T) {
	store := newIntegrationStore(t)
	svc := newIntegrationService(t, store, "")

	sessionID := "delete-roundtrip"
	mainResp, err := svc.CreateUploadURL(context.Background(), UploadURLRequest{SessionID: sessionID})
	if err != nil {
		t.Fatalf("CreateUploadURL main: %v", err)
	}
	putToPresignedURL(t, mainResp.URL, readFixtureFile(t, "session-xyz789.jsonl"))

	subResp, err := svc.CreateUploadURL(context.Background(), UploadURLRequest{
		SessionID: sessionID,
		FileName:  "subagents/agent-a1b2c3d.jsonl",
	})
	if err != nil {
		t.Fatalf("CreateUploadURL subagent: %v", err)
	}
	putToPresignedURL(t, subResp.URL, readFixtureFile(t, "session-abc123/agent-a1b2c3d.jsonl"))

	// It reads back before deletion.
	if _, err := svc.GetTranscriptFiles(context.Background(), sessionID); err != nil {
		t.Fatalf("GetTranscriptFiles before delete: %v", err)
	}

	if err := svc.DeleteTranscriptBySessionId(context.Background(), sessionID); err != nil {
		t.Fatalf("DeleteTranscriptBySessionId: %v", err)
	}

	// Read reports not found, mapping is gone, and the session is no longer listed.
	if _, err := svc.GetTranscriptFiles(context.Background(), sessionID); err != ErrNoSessionTranscriptFound {
		t.Errorf("read after delete err = %v, want ErrNoSessionTranscriptFound", err)
	}
	if _, err := store.GetSessionPrefix(context.Background(), sessionID); !errors.Is(err, ErrSessionNotMapped) {
		t.Errorf("store err = %v, want ErrSessionNotMapped", err)
	}
	sessions, err := svc.ListTranscripts(context.Background())
	if err != nil {
		t.Fatalf("ListTranscripts: %v", err)
	}
	for _, s := range sessions {
		if s.SessionID == sessionID {
			t.Errorf("deleted session %q still listed", sessionID)
		}
	}

	// And nothing remains in S3 under the session prefix.
	client := newRealS3Client(t)
	prefix := strings.TrimSuffix(mainResp.Key, mainTranscriptName(sessionID))
	out, err := client.ListObjectsV2(context.Background(), &s3.ListObjectsV2Input{
		Bucket: aws.String(testBucket),
		Prefix: aws.String(prefix),
	})
	if err != nil {
		t.Fatalf("ListObjectsV2: %v", err)
	}
	if len(out.Contents) != 0 {
		t.Errorf("expected no objects under %q, got %d", prefix, len(out.Contents))
	}
}

func putToPresignedURL(t *testing.T, url, body string) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPut, url, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("PUT to presigned URL: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("presigned PUT status = %d, body=%s", resp.StatusCode, string(b))
	}
}

func getFromPresignedURL(t *testing.T, url string) string {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET presigned URL: %v", err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read presigned GET body: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("presigned GET status = %d, body=%s", resp.StatusCode, string(b))
	}
	return string(b)
}
