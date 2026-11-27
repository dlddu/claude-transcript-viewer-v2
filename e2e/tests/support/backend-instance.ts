import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Some states cannot be reached through the shared seeded backend — an empty
 * DB, or storage credentials that are denied some S3 action. They are produced
 * by running the real server with its own `DB_PATH` and/or `env` instead of
 * intercepting requests (docs/e2e-mocking-policy.md).
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface BackendInstance {
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
      throw new Error(`backend instance exited early with code ${child.exitCode}`);
    }
    try {
      const resp = await fetch(`${baseURL}/api/health`);
      if (resp.ok) return;
    } catch {
      // the server may not be listening yet — expected while it starts
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('backend instance did not become healthy within 30s');
}

export interface BackendOptions {
  dbPath?: string;
  env?: Record<string, string>;
}

export async function startBackend(opts: BackendOptions = {}): Promise<BackendInstance> {
  const bin = process.env.SERVER_BIN || path.join(repoRoot, 'backend/server');
  const staticDir = process.env.STATIC_DIR || path.join(repoRoot, 'frontend/dist');
  const dir = mkdtempSync(path.join(tmpdir(), 'backend-instance-'));
  const port = await freePort();

  const child = spawn(bin, [], {
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: opts.dbPath ?? path.join(dir, 'backend.db'),
      STATIC_DIR: staticDir,
      ...opts.env,
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
