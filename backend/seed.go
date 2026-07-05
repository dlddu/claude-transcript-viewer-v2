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

// seedCreatedAtBase anchors the created_at stamps seed assigns. A fixed base
// (rather than time.Now) makes a seeded environment's session ordering fully
// deterministic and reproducible: fixtures are recorded oldest→newest in
// fixture order (base + index·seedCreatedAtStep), so the E2E suite can assert
// the session list's newest-first ordering without depending on the wall clock.
// It sits in the past so any session uploaded live during a test run sorts above
// the seeded fixtures.
var seedCreatedAtBase = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

// seedCreatedAtStep spaces successive fixtures far enough apart that the
// RFC3339 (second-resolution) stamps stay distinct and clearly ordered.
const seedCreatedAtStep = time.Minute

func seedDir(ctx context.Context, svc *S3Service, store SessionStore, dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read fixtures dir: %w", err)
	}

	// os.ReadDir returns entries sorted by name, so seq assigns a stable,
	// deterministic created_at per fixture: later fixtures are recorded as newer.
	seq := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") {
			continue
		}
		sessionID := strings.TrimSuffix(entry.Name(), ".jsonl")

		createdAt := seedCreatedAtBase.Add(time.Duration(seq) * seedCreatedAtStep)
		seq++

		candidate := svc.prefix + hiveSessionPrefix(sessionID, createdAt)
		if err := store.PutSessionAt(ctx, sessionID, candidate, createdAt); err != nil {
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
		if err := svc.PutObject(ctx, prefix+mainTranscriptName(sessionID), mainBody); err != nil {
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

// seedSubagents uploads a session's subagent files. It accepts both
// "<session>/agent-*.jsonl" (placed directly in the session dir) and
// "<session>/subagents/*.jsonl" (placed under the subagents/ subdir).
func seedSubagents(ctx context.Context, svc *S3Service, dir, sessionID, prefix string) (int, error) {
	subDir := filepath.Join(dir, sessionID)
	entries, err := os.ReadDir(subDir)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("read subagent dir %q: %w", subDir, err)
	}

	count := 0
	for _, e := range entries {
		switch {
		case e.IsDir() && e.Name() == strings.TrimSuffix(subagentsDir, "/"):
			nested, err := os.ReadDir(filepath.Join(subDir, e.Name()))
			if err != nil {
				return count, fmt.Errorf("read subagents dir: %w", err)
			}
			for _, n := range nested {
				if n.IsDir() || !strings.HasSuffix(n.Name(), ".jsonl") {
					continue
				}
				if err := seedFile(ctx, svc, filepath.Join(subDir, e.Name(), n.Name()), prefix+subagentsDir+n.Name()); err != nil {
					return count, err
				}
				count++
			}
		case !e.IsDir() && strings.HasPrefix(e.Name(), "agent-") && strings.HasSuffix(e.Name(), ".jsonl"):
			if err := seedFile(ctx, svc, filepath.Join(subDir, e.Name()), prefix+e.Name()); err != nil {
				return count, err
			}
			count++
		}
	}
	return count, nil
}

func seedFile(ctx context.Context, svc *S3Service, path, key string) error {
	body, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := svc.PutObject(ctx, key, body); err != nil {
		return fmt.Errorf("upload %q: %w", key, err)
	}
	return nil
}
