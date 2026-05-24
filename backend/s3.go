package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
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

// MappingStore records which S3 key holds the transcript for a session ID.
// It is the authoritative index of available transcripts.
type MappingStore interface {
	Put(ctx context.Context, sessionID, s3Key, uploadedAt string) error
	Get(ctx context.Context, sessionID string) (string, error)
	List(ctx context.Context) ([]string, error)
}

type S3ServiceConfig struct {
	Bucket                string
	Region                string
	Endpoint              string
	Prefix                string
	AssumeRoleARN         string
	AssumeRoleSessionName string
	AssumeRoleExternalID  string
	AssumeRoleDuration    time.Duration
}

type S3Service struct {
	client S3API
	bucket string
	prefix string
	store  MappingStore
	now    func() time.Time
}

var (
	ErrSessionIDRequired        = errors.New("Session ID is required")
	ErrNoSessionTranscriptFound = errors.New("No transcript found for session ID")
	ErrEmptyTranscript          = errors.New("transcript content is empty")
	ErrInvalidTranscript        = errors.New("transcript content is not valid JSONL")
)

func NewS3Service(ctx context.Context, cfg S3ServiceConfig, store MappingStore) (*S3Service, error) {
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
	return &S3Service{
		client: client,
		bucket: cfg.Bucket,
		prefix: normalizePrefix(cfg.Prefix),
		store:  store,
		now:    time.Now,
	}, nil
}

// NewS3ServiceWithClient builds a service around a pre-existing client.
// Used by tests with a mocked S3API and by code that already configured
// its own AWS client.
func NewS3ServiceWithClient(client S3API, bucket, prefix string, store MappingStore) *S3Service {
	return &S3Service{
		client: client,
		bucket: bucket,
		prefix: normalizePrefix(prefix),
		store:  store,
		now:    time.Now,
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

func (s *S3Service) ListTranscripts(ctx context.Context) ([]string, error) {
	ids, err := s.store.List(ctx)
	if err != nil {
		return nil, err
	}
	if ids == nil {
		return []string{}, nil
	}
	return ids, nil
}

func (s *S3Service) GetTranscriptBySessionId(ctx context.Context, sessionID string) (Transcript, error) {
	trimmed := strings.TrimSpace(sessionID)
	if trimmed == "" {
		return nil, ErrSessionIDRequired
	}

	mainKey, err := s.store.Get(ctx, trimmed)
	if err != nil {
		if errors.Is(err, ErrMappingNotFound) {
			return nil, ErrNoSessionTranscriptFound
		}
		return nil, err
	}

	mainOut, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(mainKey),
	})
	if err != nil {
		if isNoSuchKeyError(err) || isNoSuchBucketError(err) {
			return nil, ErrNoSessionTranscriptFound
		}
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

	// Subagent files live under "<mainKeyWithoutExt>/". The main key never
	// matches this prefix, so listing it yields only subagent objects.
	subagentPrefix := strings.TrimSuffix(mainKey, ".jsonl") + "/"
	listOut, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(s.bucket),
		Prefix: aws.String(subagentPrefix),
	})
	if err != nil && !isNoSuchBucketError(err) {
		return nil, err
	}

	var subagentKeys []string
	if listOut != nil {
		for _, item := range listOut.Contents {
			k := aws.ToString(item.Key)
			if k == "" || !strings.HasPrefix(k, subagentPrefix) {
				continue
			}
			if !strings.HasSuffix(k, ".jsonl") {
				continue
			}
			subagentKeys = append(subagentKeys, k)
		}
	}
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

// UploadTranscript stores a session's transcript (and any subagent files) in S3
// under a Hive-style partitioned key derived from the upload time, then records
// the session ID to S3 key mapping. It returns the main object's S3 key.
func (s *S3Service) UploadTranscript(ctx context.Context, in UploadInput) (string, error) {
	sessionID := strings.TrimSpace(in.SessionID)
	if sessionID == "" {
		return "", ErrSessionIDRequired
	}
	if len(in.Content) == 0 {
		return "", ErrEmptyTranscript
	}
	if _, err := parseJSONLines(in.Content); err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalidTranscript, err)
	}

	uploadedAt := s.now().UTC()
	mainKey := hiveKey(s.prefix, sessionID, uploadedAt)

	if _, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(mainKey),
		Body:        bytes.NewReader(in.Content),
		ContentType: aws.String("application/x-ndjson"),
	}); err != nil {
		return "", fmt.Errorf("put main object: %w", err)
	}

	base := strings.TrimSuffix(mainKey, ".jsonl")
	for i, sub := range in.Subagents {
		if _, err := parseJSONLines(sub.Content); err != nil {
			return "", fmt.Errorf("%w: subagent %d: %v", ErrInvalidTranscript, i, err)
		}
		agentID := sanitizeAgentID(sub.ID)
		if agentID == "" {
			agentID = fmt.Sprintf("agent-%d", i+1)
		}
		subKey := base + "/" + agentID + ".jsonl"
		if _, err := s.client.PutObject(ctx, &s3.PutObjectInput{
			Bucket:      aws.String(s.bucket),
			Key:         aws.String(subKey),
			Body:        bytes.NewReader(sub.Content),
			ContentType: aws.String("application/x-ndjson"),
		}); err != nil {
			return "", fmt.Errorf("put subagent %q: %w", agentID, err)
		}
	}

	if err := s.store.Put(ctx, sessionID, mainKey, uploadedAt.Format(time.RFC3339)); err != nil {
		return "", fmt.Errorf("record mapping: %w", err)
	}
	return mainKey, nil
}

// hiveKey builds a Hive-style partitioned S3 key from the upload time (UTC):
//
//	<prefix>year=YYYY/month=MM/day=DD/hour=HH/<sessionID>.jsonl
func hiveKey(prefix, sessionID string, t time.Time) string {
	t = t.UTC()
	return fmt.Sprintf("%syear=%04d/month=%02d/day=%02d/hour=%02d/%s.jsonl",
		prefix, t.Year(), int(t.Month()), t.Day(), t.Hour(), sessionID)
}

// sanitizeAgentID reduces an uploaded subagent file name to a bare agent ID:
// the base name without any directory component or .jsonl suffix.
func sanitizeAgentID(name string) string {
	name = strings.TrimSpace(name)
	if i := strings.LastIndexAny(name, "/\\"); i >= 0 {
		name = name[i+1:]
	}
	name = strings.TrimSuffix(name, ".jsonl")
	return strings.TrimSpace(name)
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

	fileName := key
	if i := strings.LastIndex(fileName, "/"); i >= 0 {
		fileName = fileName[i+1:]
	}
	agentID := strings.TrimSuffix(fileName, ".jsonl")

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

func isNoSuchBucketError(err error) bool {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return apiErr.ErrorCode() == "NoSuchBucket"
	}
	return false
}

func isNoSuchKeyError(err error) bool {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		code := apiErr.ErrorCode()
		return code == "NoSuchKey" || code == "NotFound"
	}
	return false
}
