package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
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
	PresignGetObject(ctx context.Context, in *s3.GetObjectInput, opts ...func(*s3.PresignOptions)) (*v4.PresignedHTTPRequest, error)
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

// defaultDownloadTTL is the lifetime of an issued presigned download URL.
// Deliberately short: the browser fetches the files immediately after
// receiving the manifest, so the URLs only need to survive that round trip.
const defaultDownloadTTL = 5 * time.Minute

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
	Bucket   string
	Region   string
	Endpoint string
	// PublicEndpoint, when set, is used only for presigning URLs handed to
	// browsers. It covers deployments where the backend reaches S3 through an
	// internal endpoint (e.g. http://localstack:4566 inside a cluster) that
	// clients outside the cluster cannot resolve.
	PublicEndpoint        string
	Prefix                string
	AssumeRoleARN         string
	AssumeRoleSessionName string
	AssumeRoleExternalID  string
	AssumeRoleDuration    time.Duration
	UploadURLTTL          time.Duration
	DownloadURLTTL        time.Duration
}

type S3Service struct {
	client      S3API
	presigner   Presigner
	store       SessionStore
	bucket      string
	prefix      string
	uploadTTL   time.Duration
	downloadTTL time.Duration
	now         func() time.Time
}

var (
	ErrSessionIDRequired        = errors.New("Session ID is required")
	ErrSessionIDInvalid         = errors.New("Session ID contains invalid characters")
	ErrUploadNameInvalid        = errors.New("Upload file name must match [A-Za-z0-9._-]+.jsonl")
	ErrNoSessionTranscriptFound = errors.New("Session transcript not found")
)

// UploadURLRequest selects which file of a session to issue an upload URL for.
// SessionID comes from the route path. FileName is an optional override
// (e.g. "agent-xyz.jsonl" for a subagent) that defaults to "<session_id>.jsonl".
type UploadURLRequest struct {
	SessionID string
	FileName  string
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

	endpointOpts := func(endpoint string) []func(*s3.Options) {
		if endpoint == "" {
			return nil
		}
		return []func(*s3.Options){func(o *s3.Options) {
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true
		}}
	}

	switch {
	case cfg.Endpoint != "":
		ak := envOr("AWS_ACCESS_KEY_ID", "minioadmin")
		sk := envOr("AWS_SECRET_ACCESS_KEY", "minioadmin")
		awsCfg.Credentials = credentials.NewStaticCredentialsProvider(ak, sk, "")
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

	client := s3.NewFromConfig(awsCfg, endpointOpts(cfg.Endpoint)...)

	// Presign against the public endpoint when it differs from the one the
	// backend itself uses; SigV4 signs the Host header, so the URL must be
	// built for the host the browser will actually contact.
	presignTarget := client
	if cfg.PublicEndpoint != "" && cfg.PublicEndpoint != cfg.Endpoint {
		presignTarget = s3.NewFromConfig(awsCfg, endpointOpts(cfg.PublicEndpoint)...)
	}

	uploadTTL := cfg.UploadURLTTL
	if uploadTTL <= 0 {
		uploadTTL = defaultUploadTTL
	}
	downloadTTL := cfg.DownloadURLTTL
	if downloadTTL <= 0 {
		downloadTTL = defaultDownloadTTL
	}
	return &S3Service{
		client:      client,
		presigner:   s3.NewPresignClient(presignTarget),
		store:       store,
		bucket:      cfg.Bucket,
		prefix:      normalizePrefix(cfg.Prefix),
		uploadTTL:   uploadTTL,
		downloadTTL: downloadTTL,
		now:         time.Now,
	}, nil
}

// NewS3ServiceWithClient builds a service around pre-existing collaborators.
// Used by tests with mocks and by code that already configured its own
// AWS clients.
func NewS3ServiceWithClient(client S3API, presigner Presigner, store SessionStore, bucket, prefix string) *S3Service {
	return &S3Service{
		client:      client,
		presigner:   presigner,
		store:       store,
		bucket:      bucket,
		prefix:      normalizePrefix(prefix),
		uploadTTL:   defaultUploadTTL,
		downloadTTL: defaultDownloadTTL,
		now:         time.Now,
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

// GetTranscriptFiles resolves a session to its transcript objects and returns
// short-lived presigned GET URLs for each. Clients download the files directly
// from S3; the backend only lists keys and signs URLs, so its memory and
// bandwidth cost stays flat regardless of transcript size.
func (s *S3Service) GetTranscriptFiles(ctx context.Context, sessionID string) (TranscriptFilesResponse, error) {
	trimmed := strings.TrimSpace(sessionID)
	if trimmed == "" {
		return TranscriptFilesResponse{}, ErrSessionIDRequired
	}

	keyPrefix, err := s.store.GetSessionPrefix(ctx, trimmed)
	if errors.Is(err, ErrSessionNotMapped) {
		return TranscriptFilesResponse{}, ErrNoSessionTranscriptFound
	}
	if err != nil {
		return TranscriptFilesResponse{}, err
	}

	keys, err := s.listKeys(ctx, keyPrefix)
	if err != nil {
		if isNoSuchBucketError(err) {
			return TranscriptFilesResponse{}, ErrNoSessionTranscriptFound
		}
		return TranscriptFilesResponse{}, err
	}

	mainKey := keyPrefix + mainTranscriptName(trimmed)
	subagentsPrefix := keyPrefix + subagentsDir
	var subagentKeys []string
	hasMain := false
	for _, k := range keys {
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
		return TranscriptFilesResponse{}, ErrNoSessionTranscriptFound
	}
	sort.Strings(subagentKeys)

	main, err := s.presignDownload(ctx, trimmed, mainKey)
	if err != nil {
		return TranscriptFilesResponse{}, err
	}
	subagents := make([]TranscriptFileRef, 0, len(subagentKeys))
	for _, k := range subagentKeys {
		ref, err := s.presignDownload(ctx, agentIDFromKey(k), k)
		if err != nil {
			return TranscriptFilesResponse{}, err
		}
		subagents = append(subagents, ref)
	}

	return TranscriptFilesResponse{
		SessionID: trimmed,
		ExpiresIn: int(s.downloadTTL.Seconds()),
		Main:      main,
		Subagents: subagents,
	}, nil
}

// listKeys returns every object key under prefix, following continuation
// tokens so sessions with more than one page of objects are fully listed.
func (s *S3Service) listKeys(ctx context.Context, prefix string) ([]string, error) {
	var keys []string
	var token *string
	for {
		out, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(s.bucket),
			Prefix:            aws.String(prefix),
			ContinuationToken: token,
		})
		if err != nil {
			return nil, err
		}
		for _, item := range out.Contents {
			keys = append(keys, aws.ToString(item.Key))
		}
		if !aws.ToBool(out.IsTruncated) || out.NextContinuationToken == nil {
			return keys, nil
		}
		token = out.NextContinuationToken
	}
}

func (s *S3Service) presignDownload(ctx context.Context, agentID, key string) (TranscriptFileRef, error) {
	presigned, err := s.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, func(o *s3.PresignOptions) {
		o.Expires = s.downloadTTL
	})
	if err != nil {
		return TranscriptFileRef{}, fmt.Errorf("presign get object %q: %w", key, err)
	}
	return TranscriptFileRef{
		ID:   agentID,
		Name: baseName(key),
		Key:  key,
		URL:  presigned.URL,
	}, nil
}

// agentIDFromKey derives a subagent's id from its object key: the file base
// name without the ".jsonl" extension (matching how transcripts are uploaded).
func agentIDFromKey(key string) string {
	return strings.TrimSuffix(baseName(key), ".jsonl")
}

func baseName(key string) string {
	if i := strings.LastIndex(key, "/"); i >= 0 {
		return key[i+1:]
	}
	return key
}

func isNoSuchBucketError(err error) bool {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return apiErr.ErrorCode() == "NoSuchBucket"
	}
	return false
}
