import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A second, real backend instance with an empty SQLite DB.
 *
 * "Zero sessions" is a data state, not a failure mode, so it is produced by
 * starting the real server against an empty `DB_PATH` instead of intercepting
 * the list response (docs/e2e-mocking-policy.md). The instance serves the same
 * built frontend as the shared backend and inherits the S3 settings from the
 * environment; the list endpoint reads only SQLite, so the empty instance
 * never touches S3.
 *
 * Env: `SERVER_BIN` (default `backend/server`) and `STATIC_DIR` (default
 * `frontend/dist`) point at the built binary and frontend bundle.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface EmptyBackend {
  baseURL: string;
  stop: () => Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

async function waitHealthy(baseURL: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`empty backend exited early with code ${child.exitCode}`);
    }
    try {
      const resp = await fetch(`${baseURL}/api/health`);
      if (resp.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('empty backend did not become healthy within 30s');
}

export async function startEmptyBackend(): Promise<EmptyBackend> {
  const bin = process.env.SERVER_BIN || path.join(repoRoot, 'backend/server');
  const staticDir = process.env.STATIC_DIR || path.join(repoRoot, 'frontend/dist');
  const dir = mkdtempSync(path.join(tmpdir(), 'empty-backend-'));
  const port = await freePort();

  const child = spawn(bin, [], {
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(dir, 'empty.db'),
      STATIC_DIR: staticDir,
    },
    stdio: 'inherit',
  });

  const baseURL = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
    }
    rmSync(dir, { recursive: true, force: true });
  };

  try {
    await waitHealthy(baseURL, child);
  } catch (err) {
    await stop();
    throw err;
  }
  return { baseURL, stop };
}
