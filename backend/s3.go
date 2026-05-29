package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/credentials/stscreds"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	"github.com/aws/smithy-go"
)

// S3API is the subset of *s3.Client used by S3Service. It exists so that
// tests can substitute a fake client without touching the network.
type S3API interface {
	GetObject(ctx context.Context, in *s3.GetObjectInput, opts ...func(*s3.Options)) (*s3.GetObjectOutput, error)
	ListObjectsV2(ctx context.Context, in *s3.ListObjectsV2Input, opts ...func(*s3.Options)) (*s3.ListObjectsV2Output, error)
	PutObject(ctx context.Context, in *s3.PutObjectInput, opts ...func(*s3.Options)) (*s3.PutObjectOutput, error)
}

// Presigner produces presigned S3 requests. *s3.PresignClient satisfies it;
// tests substitute a fake.
type Presigner interface {
	PresignPutObject(ctx context.Context, in *s3.PutObjectInput, opts ...func(*s3.PresignOptions)) (*v4.PresignedHTTPRequest, error)
}

// SessionStore maps a session id to the S3 key prefix holding its transcript
// files. *Store is the production implementation.
type SessionStore interface {
	GetSessionPrefix(ctx context.Context, sessionID string) (string, error)
	PutSession(ctx context.Context, sessionID, s3Prefix string) error
	ListSessionIDs(ctx context.Context) ([]string, error)
}

// defaultUploadTTL is the lifetime of an issued presigned upload URL.
const defaultUploadTTL = 15 * time.Minute

// mainTranscriptName is the object name of a session's primary transcript
// within its Hive-partitioned directory: the session id plus ".jsonl".
func mainTranscriptName(sessionID string) string {
	return sessionID + ".jsonl"
}

// subagentsDir is an optional subdirectory inside a session's Hive directory
// where subagent transcripts may live, e.g. session_id=<id>/subagents/<file>.
const subagentsDir = "subagents/"

var (
	sessionIDPattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)
	// An upload file name is a bare "<name>.jsonl" or "subagents/<name>.jsonl".
	uploadNamePattern = regexp.MustCompile(`^(subagents/)?[A-Za-z0-9._-]+\.jsonl$`)
)

type S3ServiceConfig struct {
	Bucket                string
	Region                string
	Endpoint              string
	Prefix                string
	AssumeRoleARN         string
	AssumeRoleSessionName string
	AssumeRoleExternalID  string
	AssumeRoleDuration    time.Duration
	UploadURLTTL          time.Duration
}

type S3Service struct {
	client    S3API
	presigner Presigner
	store     SessionStore
	bucket    string
	prefix    string
	uploadTTL time.Duration
	now       func() time.Time
}

var (
	ErrSessionIDRequired        = errors.New("Session ID is required")
	ErrSessionIDInvalid         = errors.New("Session ID contains invalid characters")
	ErrUploadNameInvalid        = errors.New("Upload file name must match [A-Za-z0-9._-]+.jsonl")
	ErrNoSessionTranscriptFound = errors.New("No transcript found for session ID")
	ErrTimestampRequired        = errors.New("Timestamp is required")
	ErrTimestampInvalid         = errors.New("Timestamp must be RFC3339, e.g. 2026-05-24T15:04:05Z")
	ErrSessionAlreadyMapped     = errors.New("Session is already mapped")
)

// UploadURLRequest selects which file of a session to issue an upload URL for.
// SessionID comes from the route path. FileName is an optional override
// (e.g. "agent-xyz.jsonl" for a subagent) that defaults to "<session_id>.jsonl".
type UploadURLRequest struct {
	SessionID string
	FileName  string
}

// MigrationUploadURLRequest is like UploadURLRequest, but the caller supplies
// the partition Timestamp explicitly instead of letting the server use the
// current time. It backs the migration endpoint, e.g. for importing historical
// transcripts into the partition matching their original time.
type MigrationUploadURLRequest struct {
	SessionID string
	FileName  string
	Timestamp time.Time
}

// UploadURLResponse is returned to clients that will PUT a transcript to S3.
type UploadURLResponse struct {
	URL       string `json:"url"`
	Method    string `json:"method"`
	Key       string `json:"key"`
	SessionID string `json:"session_id"`
	ExpiresIn int    `json:"expires_in"`
}

func NewS3Service(ctx context.Context, cfg S3ServiceConfig, store SessionStore) (*S3Service, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(cfg.Region))
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}

	var clientOpts []func(*s3.Options)

	switch {
	case cfg.Endpoint != "":
		ak := envOr("AWS_ACCESS_KEY_ID", "minioadmin")
		sk := envOr("AWS_SECRET_ACCESS_KEY", "minioadmin")
		awsCfg.Credentials = credentials.NewStaticCredentialsProvider(ak, sk, "")
		clientOpts = append(clientOpts, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
			o.UsePathStyle = true
		})
	case cfg.AssumeRoleARN != "":
		stsClient := sts.NewFromConfig(awsCfg)
		provider := stscreds.NewAssumeRoleProvider(stsClient, cfg.AssumeRoleARN, func(o *stscreds.AssumeRoleOptions) {
			if cfg.AssumeRoleSessionName != "" {
				o.RoleSessionName = cfg.AssumeRoleSessionName
			} else {
				o.RoleSessionName = "claude-transcript-viewer"
			}
			if cfg.AssumeRoleExternalID != "" {
				o.ExternalID = aws.String(cfg.AssumeRoleExternalID)
			}
			if cfg.AssumeRoleDuration > 0 {
				o.Duration = cfg.AssumeRoleDuration
			}
		})
		awsCfg.Credentials = aws.NewCredentialsCache(provider)
	}

	client := s3.NewFromConfig(awsCfg, clientOpts...)
	ttl := cfg.UploadURLTTL
	if ttl <= 0 {
		ttl = defaultUploadTTL
	}
	return &S3Service{
		client:    client,
		presigner: s3.NewPresignClient(client),
		store:     store,
		bucket:    cfg.Bucket,
		prefix:    normalizePrefix(cfg.Prefix),
		uploadTTL: ttl,
		now:       time.Now,
	}, nil
}

// NewS3ServiceWithClient builds a service around pre-existing collaborators.
// Used by tests with mocks and by code that already configured its own
// AWS clients.
func NewS3ServiceWithClient(client S3API, presigner Presigner, store SessionStore, bucket, prefix string) *S3Service {
	return &S3Service{
		client:    client,
		presigner: presigner,
		store:     store,
		bucket:    bucket,
		prefix:    normalizePrefix(prefix),
		uploadTTL: defaultUploadTTL,
		now:       time.Now,
	}
}

func normalizePrefix(prefix string) string {
	if prefix == "" {
		return ""
	}
	trimmed := strings.TrimLeft(prefix, "/")
	if trimmed == "" {
		return ""
	}
	if !strings.HasSuffix(trimmed, "/") {
		trimmed += "/"
	}
	return trimmed
}

func (s *S3Service) Prefix() string { return s.prefix }

// hiveSessionPrefix builds the Hive-style partition path for a session,
// relative to the configured S3 prefix:
//
//	year=2026/month=05/day=24/hour=15/session_id=<id>/
func hiveSessionPrefix(sessionID string, t time.Time) string {
	u := t.UTC()
	return fmt.Sprintf("year=%04d/month=%02d/day=%02d/hour=%02d/session_id=%s/",
		u.Year(), int(u.Month()), u.Day(), u.Hour(), sessionID)
}

func validateSessionID(sessionID string) (string, error) {
	trimmed := strings.TrimSpace(sessionID)
	if trimmed == "" {
		return "", ErrSessionIDRequired
	}
	if !sessionIDPattern.MatchString(trimmed) {
		return "", ErrSessionIDInvalid
	}
	return trimmed, nil
}

// CreateUploadURL issues a presigned PUT URL for uploading a transcript file
// of the given session. The session's Hive-partitioned directory is computed
// once and persisted so that the main transcript and any later subagent
// uploads share a single directory.
func (s *S3Service) CreateUploadURL(ctx context.Context, req UploadURLRequest) (UploadURLResponse, error) {
	sessionID, err := validateSessionID(req.SessionID)
	if err != nil {
		return UploadURLResponse{}, err
	}

	fileName := strings.TrimSpace(req.FileName)
	if fileName == "" {
		fileName = mainTranscriptName(sessionID)
	}
	if !uploadNamePattern.MatchString(fileName) {
		return UploadURLResponse{}, ErrUploadNameInvalid
	}

	prefix, err := s.store.GetSessionPrefix(ctx, sessionID)
	if errors.Is(err, ErrSessionNotMapped) {
		candidate := s.prefix + hiveSessionPrefix(sessionID, s.now())
		if err := s.store.PutSession(ctx, sessionID, candidate); err != nil {
			return UploadURLResponse{}, err
		}
		// Re-read so a concurrent first-writer's value wins consistently.
		prefix, err = s.store.GetSessionPrefix(ctx, sessionID)
	}
	if err != nil {
		return UploadURLResponse{}, err
	}

	key := prefix + fileName
	presigned, err := s.presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, func(o *s3.PresignOptions) {
		o.Expires = s.uploadTTL
	})
	if err != nil {
		return UploadURLResponse{}, fmt.Errorf("presign put object: %w", err)
	}

	return UploadURLResponse{
		URL:       presigned.URL,
		Method:    presigned.Method,
		Key:       key,
		SessionID: sessionID,
		ExpiresIn: int(s.uploadTTL.Seconds()),
	}, nil
}

// CreateMigrationUploadURL issues a presigned PUT URL like CreateUploadURL,
// except the session's Hive partition is derived from the caller-supplied
// Timestamp (UTC-normalized) rather than s.now(). It is intended for importing
// historical transcripts into the partition matching their original time.
//
// Unlike CreateUploadURL, it refuses to touch a session that is already
// indexed: if the session id already has a prefix, it returns
// ErrSessionAlreadyMapped and writes nothing.
func (s *S3Service) CreateMigrationUploadURL(ctx context.Context, req MigrationUploadURLRequest) (UploadURLResponse, error) {
	sessionID, err := validateSessionID(req.SessionID)
	if err != nil {
		return UploadURLResponse{}, err
	}

	if req.Timestamp.IsZero() {
		return UploadURLResponse{}, ErrTimestampRequired
	}

	fileName := strings.TrimSpace(req.FileName)
	if fileName == "" {
		fileName = mainTranscriptName(sessionID)
	}
	if !uploadNamePattern.MatchString(fileName) {
		return UploadURLResponse{}, ErrUploadNameInvalid
	}

	// Migration only places sessions that are not already indexed.
	if _, err := s.store.GetSessionPrefix(ctx, sessionID); err == nil {
		return UploadURLResponse{}, ErrSessionAlreadyMapped
	} else if !errors.Is(err, ErrSessionNotMapped) {
		return UploadURLResponse{}, err
	}

	prefix := s.prefix + hiveSessionPrefix(sessionID, req.Timestamp)
	if err := s.store.PutSession(ctx, sessionID, prefix); err != nil {
		return UploadURLResponse{}, err
	}
	// PutSession is first-writer-wins; re-read to catch a concurrent writer that
	// mapped this session between the check above and the insert.
	stored, err := s.store.GetSessionPrefix(ctx, sessionID)
	if err != nil {
		return UploadURLResponse{}, err
	}
	if stored != prefix {
		return UploadURLResponse{}, ErrSessionAlreadyMapped
	}

	key := prefix + fileName
	presigned, err := s.presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, func(o *s3.PresignOptions) {
		o.Expires = s.uploadTTL
	})
	if err != nil {
		return UploadURLResponse{}, fmt.Errorf("presign put object: %w", err)
	}

	return UploadURLResponse{
		URL:       presigned.URL,
		Method:    presigned.Method,
		Key:       key,
		SessionID: sessionID,
		ExpiresIn: int(s.uploadTTL.Seconds()),
	}, nil
}

// PutObject uploads a transcript object directly using the service's S3
// credentials. Used by the seed subcommand; the normal upload path goes
// through presigned URLs.
func (s *S3Service) PutObject(ctx context.Context, key string, body []byte) error {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(body),
		ContentType: aws.String("application/x-ndjson"),
	})
	if err != nil {
		return fmt.Errorf("put object %q: %w", key, err)
	}
	return nil
}

func (s *S3Service) ListTranscripts(ctx context.Context) ([]string, error) {
	return s.store.ListSessionIDs(ctx)
}

func (s *S3Service) GetTranscriptBySessionId(ctx context.Context, sessionID string) (Transcript, error) {
	trimmed := strings.TrimSpace(sessionID)
	if trimmed == "" {
		return nil, ErrSessionIDRequired
	}

	keyPrefix, err := s.store.GetSessionPrefix(ctx, trimmed)
	if errors.Is(err, ErrSessionNotMapped) {
		return nil, ErrNoSessionTranscriptFound
	}
	if err != nil {
		return nil, err
	}

	listOut, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(s.bucket),
		Prefix: aws.String(keyPrefix),
	})
	if err != nil {
		if isNoSuchBucketError(err) {
			return nil, ErrNoSessionTranscriptFound
		}
		return nil, err
	}
	if len(listOut.Contents) == 0 {
		return nil, ErrNoSessionTranscriptFound
	}

	mainKey := keyPrefix + mainTranscriptName(trimmed)
	subagentsPrefix := keyPrefix + subagentsDir
	var subagentKeys []string
	hasMain := false
	for _, item := range listOut.Contents {
		k := aws.ToString(item.Key)
		switch {
		case k == mainKey:
			hasMain = true
		case strings.HasPrefix(k, subagentsPrefix):
			// Any file under session_id=<id>/subagents/ is a subagent.
			subagentKeys = append(subagentKeys, k)
		case strings.HasPrefix(baseName(k), "agent-"):
			// Backwards-compatible: agent-*.jsonl directly in the session dir.
			subagentKeys = append(subagentKeys, k)
		}
	}
	if !hasMain {
		return nil, ErrNoSessionTranscriptFound
	}

	mainOut, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(mainKey),
	})
	if err != nil {
		return nil, err
	}
	defer mainOut.Body.Close()

	body, err := io.ReadAll(mainOut.Body)
	if err != nil {
		return nil, err
	}
	bodyStr := string(body)

	mainMessages, err := parseJSONLines(body)
	if err != nil {
		return nil, fmt.Errorf("parse main jsonl: %w", err)
	}

	transcript := Transcript{}
	transcript.SetString("id", trimmed)
	transcript.SetString("session_id", trimmed)
	transcript.SetString("content", bodyStr)

	for _, msg := range mainMessages {
		if msg.GetString("agentId") == "" {
			msg.SetString("agentId", trimmed)
		}
	}

	allMessages := append([]TranscriptMessage{}, mainMessages...)

	sort.Strings(subagentKeys)
	subagents := make([]SubagentTranscript, 0, len(subagentKeys))
	for _, k := range subagentKeys {
		sub, msgs, err := s.fetchSubagent(ctx, k)
		if err != nil {
			continue
		}
		subagents = append(subagents, sub)
		allMessages = append(allMessages, msgs...)
	}

	if len(subagents) > 0 {
		transcript.SetAny("subagents", subagents)
	}

	sort.SliceStable(allMessages, func(i, j int) bool {
		ti := parseTimestamp(allMessages[i].GetString("timestamp"))
		tj := parseTimestamp(allMessages[j].GetString("timestamp"))
		return ti.Before(tj)
	})

	transcript.SetAny("messages", allMessages)
	return transcript, nil
}

func (s *S3Service) fetchSubagent(ctx context.Context, key string) (SubagentTranscript, []TranscriptMessage, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return SubagentTranscript{}, nil, err
	}
	defer out.Body.Close()

	body, err := io.ReadAll(out.Body)
	if err != nil {
		return SubagentTranscript{}, nil, err
	}

	agentID := strings.TrimSuffix(baseName(key), ".jsonl")

	messages, err := parseJSONLines(body)
	if err != nil {
		return SubagentTranscript{}, nil, err
	}

	for _, msg := range messages {
		if msg.GetString("agentId") == "" {
			msg.SetString("agentId", agentID)
		}
	}

	return SubagentTranscript{
		ID:             agentID,
		Name:           agentID,
		TranscriptFile: key,
		Content:        string(body),
		Messages:       messages,
	}, messages, nil
}

func baseName(key string) string {
	if i := strings.LastIndex(key, "/"); i >= 0 {
		return key[i+1:]
	}
	return key
}

func parseJSONLines(body []byte) ([]TranscriptMessage, error) {
	var out []TranscriptMessage
	scanner := bufio.NewScanner(bytes.NewReader(body))
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		var msg TranscriptMessage
		if err := json.Unmarshal(line, &msg); err != nil {
			return nil, err
		}
		out = append(out, msg)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func parseTimestamp(s string) time.Time {
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t
	}
	return time.Time{}
}

// parseTimestampStrict parses an RFC3339 / RFC3339Nano timestamp and, unlike
// parseTimestamp, returns an error so callers can distinguish a missing or
// malformed value from a valid one.
func parseTimestampStrict(s string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, s)
}

func isNoSuchBucketError(err error) bool {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return apiErr.ErrorCode() == "NoSuchBucket"
	}
	return false
}
