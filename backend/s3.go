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
	smithyhttp "github.com/aws/smithy-go/transport/http"
)

// S3API is the subset of *s3.Client used by S3Service. It exists so that
// tests can substitute a fake client without touching the network.
type S3API interface {
	GetObject(ctx context.Context, in *s3.GetObjectInput, opts ...func(*s3.Options)) (*s3.GetObjectOutput, error)
	ListObjectsV2(ctx context.Context, in *s3.ListObjectsV2Input, opts ...func(*s3.Options)) (*s3.ListObjectsV2Output, error)
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
}

var (
	ErrTranscriptNotFound       = errors.New("Transcript not found")
	ErrSessionIDRequired        = errors.New("Session ID is required")
	ErrNoSessionTranscriptFound = errors.New("No transcript found for session ID")
)

func NewS3Service(ctx context.Context, cfg S3ServiceConfig) (*S3Service, error) {
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
	}, nil
}

// NewS3ServiceWithClient builds a service around a pre-existing client.
// Used by tests with a mocked S3API and by code that already configured
// its own AWS client.
func NewS3ServiceWithClient(client S3API, bucket, prefix string) *S3Service {
	return &S3Service{
		client: client,
		bucket: bucket,
		prefix: normalizePrefix(prefix),
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

func (s *S3Service) GetTranscript(ctx context.Context, id string) (Transcript, error) {
	baseKey := id
	if !strings.HasSuffix(baseKey, ".json") {
		baseKey += ".json"
	}
	key := s.prefix + baseKey

	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFoundError(err) {
			return nil, ErrTranscriptNotFound
		}
		return nil, err
	}
	defer out.Body.Close()

	body, err := io.ReadAll(out.Body)
	if err != nil {
		return nil, err
	}

	var t Transcript
	if err := json.Unmarshal(body, &t); err != nil {
		return nil, fmt.Errorf("parse transcript JSON: %w", err)
	}
	return t, nil
}

func (s *S3Service) ListTranscripts(ctx context.Context) ([]string, error) {
	in := &s3.ListObjectsV2Input{Bucket: aws.String(s.bucket)}
	if s.prefix != "" {
		in.Prefix = aws.String(s.prefix)
	}

	out, err := s.client.ListObjectsV2(ctx, in)
	if err != nil {
		if isNoSuchBucketError(err) {
			return []string{}, nil
		}
		return nil, err
	}

	if len(out.Contents) == 0 {
		return []string{}, nil
	}

	ids := make([]string, 0, len(out.Contents))
	for _, item := range out.Contents {
		key := aws.ToString(item.Key)
		if key == "" {
			continue
		}
		if s.prefix != "" && strings.HasPrefix(key, s.prefix) {
			key = key[len(s.prefix):]
		}
		key = strings.TrimSuffix(key, ".json")
		ids = append(ids, key)
	}
	return ids, nil
}

func (s *S3Service) GetTranscriptBySessionId(ctx context.Context, sessionID string) (Transcript, error) {
	trimmed := strings.TrimSpace(sessionID)
	if trimmed == "" {
		return nil, ErrSessionIDRequired
	}

	sessionKeyPrefix := s.prefix + trimmed

	listOut, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(s.bucket),
		Prefix: aws.String(sessionKeyPrefix),
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

	var mainKey string
	for _, item := range listOut.Contents {
		k := aws.ToString(item.Key)
		if k == sessionKeyPrefix+".jsonl" || k == sessionKeyPrefix+".json" {
			mainKey = k
			break
		}
	}
	if mainKey == "" {
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

	var transcript Transcript
	var mainMessages []TranscriptMessage

	if strings.HasSuffix(mainKey, ".jsonl") {
		mainMessages, err = parseJSONLines(body)
		if err != nil {
			return nil, fmt.Errorf("parse main jsonl: %w", err)
		}
		transcript = Transcript{}
		transcript.SetString("id", trimmed)
		transcript.SetString("session_id", trimmed)
		transcript.SetString("content", bodyStr)
	} else {
		if err := json.Unmarshal(body, &transcript); err != nil {
			return nil, fmt.Errorf("parse main json: %w", err)
		}
		mainMessages, _ = extractMessages(transcript)
	}

	for _, msg := range mainMessages {
		if msg.GetString("agentId") == "" {
			msg.SetString("agentId", trimmed)
		}
	}

	allMessages := append([]TranscriptMessage{}, mainMessages...)

	subagentPrefix := sessionKeyPrefix + "/"
	var subagentKeys []string
	for _, item := range listOut.Contents {
		k := aws.ToString(item.Key)
		if strings.HasPrefix(k, subagentPrefix) && strings.Contains(k, "agent-") {
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
	agentID = strings.TrimSuffix(agentID, ".json")

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

func extractMessages(t Transcript) ([]TranscriptMessage, error) {
	raw, ok := t["messages"]
	if !ok {
		return nil, nil
	}
	var msgs []TranscriptMessage
	if err := json.Unmarshal(raw, &msgs); err != nil {
		return nil, err
	}
	return msgs, nil
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

func isNotFoundError(err error) bool {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		code := apiErr.ErrorCode()
		if code == "NoSuchKey" || code == "NotFound" {
			return true
		}
	}
	var respErr *smithyhttp.ResponseError
	if errors.As(err, &respErr) {
		return respErr.HTTPStatusCode() == 404
	}
	return false
}

func isNoSuchBucketError(err error) bool {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return apiErr.ErrorCode() == "NoSuchBucket"
	}
	return false
}
