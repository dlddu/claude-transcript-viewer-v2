import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Runs under node:test (`pnpm tsx --test`, CI job `docker-e2e-tests`), not Playwright: it is in playwright.config testIgnore.

const REPO_ROOT = resolve(__dirname, '../..');
const DOCKERFILE = resolve(REPO_ROOT, 'Dockerfile');
const IMAGE_NAME = 'claude-transcript-viewer:test';

const execCommand = (command: string, cwd?: string): string => {
  try {
    return execSync(command, {
      cwd: cwd || REPO_ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch (error: any) {
    throw new Error(`Command failed: ${command}\n${error.message}`);
  }
};

const dockerImageExists = (imageName: string): boolean => {
  const output = execCommand(`docker images -q ${imageName}`);
  return output.trim().length > 0;
};

const isDockerAvailable = (): boolean => {
  try {
    execCommand('docker info');
    return true;
  } catch {
    return false;
  }
};

describe('Docker Build - Single Application Image (DP-AC1)', () => {
  it('should have a Dockerfile at the repository root', () => {
    assert.strictEqual(existsSync(DOCKERFILE), true);
  });

  it('should not have per-service Dockerfiles anymore', () => {
    assert.strictEqual(existsSync(resolve(REPO_ROOT, 'frontend/Dockerfile')), false,
      'frontend/Dockerfile should not exist (merged into root Dockerfile)');
    assert.strictEqual(existsSync(resolve(REPO_ROOT, 'backend/Dockerfile')), false,
      'backend/Dockerfile should not exist (merged into root Dockerfile)');
    assert.strictEqual(existsSync(resolve(REPO_ROOT, 'frontend/nginx.conf')), false,
      'nginx is no longer used; the Go server serves the static frontend');
  });

  it('should use a multi-stage build with node, golang, and a slim runtime', () => {
    const dockerfileContent = readFileSync(DOCKERFILE, 'utf-8');

    assert.ok(dockerfileContent.includes('FROM node:20-alpine'));
    assert.ok(/FROM golang:\S+-alpine/i.test(dockerfileContent));
    assert.ok(/FROM alpine:\S+\s*$/m.test(dockerfileContent), 'Runtime stage should be plain alpine');
  });

  it('should build the frontend without VITE_API_URL (same-origin API)', () => {
    const dockerfileContent = readFileSync(DOCKERFILE, 'utf-8');

    assert.ok(!dockerfileContent.includes('ARG VITE_API_URL'),
      'VITE_API_URL must not be baked in; the API is same-origin');
    assert.ok(dockerfileContent.includes('pnpm build'), 'Frontend should be built with pnpm');
  });

  it('should copy the built frontend into the runtime image and expose it via STATIC_DIR', () => {
    const dockerfileContent = readFileSync(DOCKERFILE, 'utf-8');

    assert.ok(/COPY --from=frontend-build .*dist/.test(dockerfileContent),
      'Runtime stage should copy the frontend dist output');
    assert.ok(/ENV STATIC_DIR=/.test(dockerfileContent),
      'Runtime stage should set STATIC_DIR so the Go server serves the bundle');
  });

  it('should produce a static Go build with CGO disabled', () => {
    const dockerfileContent = readFileSync(DOCKERFILE, 'utf-8');

    assert.ok(dockerfileContent.includes('CGO_ENABLED=0'));
    assert.ok(dockerfileContent.includes('go build'));
  });

  it('should run the compiled server binary as entrypoint', () => {
    const dockerfileContent = readFileSync(DOCKERFILE, 'utf-8');

    assert.ok(/^(ENTRYPOINT|CMD)\s+\[.*server/m.test(dockerfileContent));
  });

  it('should build the Docker image successfully', { skip: !isDockerAvailable() ? 'Docker is not available' : false }, () => {
    execCommand(`docker build -t ${IMAGE_NAME} -f Dockerfile .`);

    assert.strictEqual(dockerImageExists(IMAGE_NAME), true);
  });

  it('should serve the API health check and the static frontend', { skip: !isDockerAvailable() ? 'Docker is not available' : false }, () => {
    const containerName = 'claude-transcript-viewer-test';
    execCommand(`docker rm -f ${containerName} || true`);

    try {
      execCommand(`docker build -t ${IMAGE_NAME} -f Dockerfile .`);
      execCommand(
        `docker run -d --name ${containerName} -p 3101:3000 -e AWS_ACCESS_KEY_ID=test -e AWS_SECRET_ACCESS_KEY=test -e S3_BUCKET=test-bucket ${IMAGE_NAME}`
      );

      execCommand('sleep 5');

      const healthOutput = execCommand('curl -f http://localhost:3101/api/health');
      assert.ok(healthOutput.includes('healthy'));

      const indexOutput = execCommand('curl -f http://localhost:3101/');
      assert.ok(indexOutput.includes('<!DOCTYPE html>'));

      const spaOutput = execCommand('curl -f http://localhost:3101/session/some-route');
      assert.ok(spaOutput.includes('<!DOCTYPE html>'));

      const apiNotFound = execCommand('curl -s http://localhost:3101/api/nope');
      assert.ok(apiNotFound.includes('"error"'));
    } finally {
      execCommand(`docker rm -f ${containerName} || true`);
    }
  });
});
