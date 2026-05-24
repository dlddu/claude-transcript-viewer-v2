package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// runSeed implements the `server seed --dir <fixtures>` subcommand. It uploads
// a directory of *.jsonl transcript fixtures to their Hive-partitioned S3 keys
// and records the session→prefix mapping in SQLite, using the same code paths
// the running server relies on. It exists so full-stack tests (and operators
// importing a backlog) can populate storage without the presigned-URL flow.
func runSeed(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("seed", flag.ContinueOnError)
	dir := fs.String("dir", "", "directory of *.jsonl transcript fixtures to seed")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *dir == "" {
		return errors.New("--dir is required")
	}

	store, err := OpenStore(ctx, dbPath())
	if err != nil {
		return err
	}
	defer store.Close()

	svc, err := NewS3Service(ctx, loadConfigFromEnv(), store)
	if err != nil {
		return err
	}

	return seedDir(ctx, svc, store, *dir)
}

func seedDir(ctx context.Context, svc *S3Service, store SessionStore, dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read fixtures dir: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") {
			continue
		}
		sessionID := strings.TrimSuffix(entry.Name(), ".jsonl")

		candidate := svc.prefix + hiveSessionPrefix(sessionID, time.Now())
		if err := store.PutSession(ctx, sessionID, candidate); err != nil {
			return err
		}
		prefix, err := store.GetSessionPrefix(ctx, sessionID)
		if err != nil {
			return err
		}

		mainBody, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			return err
		}
		if err := svc.PutObject(ctx, prefix+mainTranscriptFile, mainBody); err != nil {
			return fmt.Errorf("upload main %q: %w", sessionID, err)
		}

		count, err := seedSubagents(ctx, svc, dir, sessionID, prefix)
		if err != nil {
			return err
		}
		log.Printf("seeded session %q -> %s (%d subagents)", sessionID, prefix, count)
	}
	return nil
}

func seedSubagents(ctx context.Context, svc *S3Service, dir, sessionID, prefix string) (int, error) {
	subDir := filepath.Join(dir, sessionID)
	subEntries, err := os.ReadDir(subDir)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("read subagent dir %q: %w", subDir, err)
	}

	count := 0
	for _, sub := range subEntries {
		if sub.IsDir() || !strings.HasPrefix(sub.Name(), "agent-") || !strings.HasSuffix(sub.Name(), ".jsonl") {
			continue
		}
		body, err := os.ReadFile(filepath.Join(subDir, sub.Name()))
		if err != nil {
			return count, err
		}
		if err := svc.PutObject(ctx, prefix+sub.Name(), body); err != nil {
			return count, fmt.Errorf("upload subagent %q: %w", sub.Name(), err)
		}
		count++
	}
	return count, nil
}
