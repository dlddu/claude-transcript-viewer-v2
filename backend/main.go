package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	if len(os.Args) > 1 && os.Args[1] == "seed" {
		if err := runSeed(context.Background(), os.Args[2:]); err != nil {
			log.Fatalf("seed failed: %v", err)
		}
		return
	}

	port := envOr("PORT", "3000")

	store, err := OpenStore(context.Background(), dbPath())
	if err != nil {
		log.Fatalf("failed to open session store: %v", err)
	}
	defer store.Close()

	cfg := loadConfigFromEnv()
	svc, err := NewS3Service(context.Background(), cfg, store)
	if err != nil {
		log.Fatalf("failed to initialize S3 service: %v", err)
	}

	server := NewServer(svc)
	addr := ":" + port
	log.Printf("Server running on port %s", port)
	if err := http.ListenAndServe(addr, server); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func dbPath() string {
	return envOr("DB_PATH", "transcripts.db")
}

func loadConfigFromEnv() S3ServiceConfig {
	cfg := S3ServiceConfig{
		Bucket:                envOr("S3_BUCKET", "test-transcripts"),
		Region:                envOr("AWS_REGION", "us-east-1"),
		Endpoint:              os.Getenv("AWS_ENDPOINT_URL"),
		Prefix:                os.Getenv("S3_PREFIX"),
		AssumeRoleARN:         os.Getenv("AWS_ASSUME_ROLE_ARN"),
		AssumeRoleSessionName: os.Getenv("AWS_ASSUME_ROLE_SESSION_NAME"),
		AssumeRoleExternalID:  os.Getenv("AWS_ASSUME_ROLE_EXTERNAL_ID"),
	}
	if v := os.Getenv("AWS_ASSUME_ROLE_DURATION_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.AssumeRoleDuration = time.Duration(n) * time.Second
		}
	}
	if v := os.Getenv("UPLOAD_URL_TTL_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.UploadURLTTL = time.Duration(n) * time.Second
		}
	}
	return cfg
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
