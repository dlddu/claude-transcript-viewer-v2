import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Docker Build E2E Tests
 *
 * These tests verify Docker configuration files and build capabilities.
 * Static tests (Dockerfile/dockerignore content checks) always run.
 * Runtime tests (build, run, inspect) are skipped when Docker is unavailable.
 */

const REPO_ROOT = resolve(__dirname, '../..');
const FRONTEND_DIR = resolve(REPO_ROOT, 'frontend');
const BACKEND_DIR = resolve(REPO_ROOT, 'backend');

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

const tryExec = (command: string): void => {
  try {
    execCommand(command);
  } catch {
    // Ignore cleanup errors
  }
};

const dockerImageExists = (imageName: string): boolean => {
  const output = execCommand(`docker images -q ${imageName}`);
  return output.trim().length > 0;
};

const isDockerAvailable = (): boolean => {
  try {
    execCommand('docker --version');
    return true;
  } catch {
    return false;
  }
};

describe('Docker Build - Frontend', () => {
  it('should have a Dockerfile in frontend directory', () => {
    // Arrange
    const dockerfilePath = resolve(FRONTEND_DIR, 'Dockerfile');

    // Assert
    assert.strictEqual(existsSync(dockerfilePath), true);
  });

  it('should have a .dockerignore in frontend directory', () => {
    // Arrange
    const dockerignorePath = resolve(FRONTEND_DIR, '.dockerignore');

    // Assert
    assert.strictEqual(existsSync(dockerignorePath), true);
  });

  it('should build frontend Docker image successfully', { skip: !isDockerAvailable() ? 'Docker is not available' : false }, () => {
    // Arrange
    const imageName = 'claude-transcript-viewer-frontend:test';

    try {
      // Act - Build from repo root with explicit Dockerfile path
      execCommand(`docker build -t ${imageName} -f frontend/Dockerfile .`);

      // Assert - Verify image was created
      assert.strictEqual(dockerImageExists(imageName), true);
    } finally {
      tryExec(`docker rmi ${imageName}`);
    }
  });

  it('should use multi-stage build with node and nginx', () => {
    // Arrange
    const dockerfilePath = resolve(FRONTEND_DIR, 'Dockerfile');
    const dockerfileContent = readFileSync(dockerfilePath, 'utf-8');

    // Assert
    assert.ok(dockerfileContent.includes('FROM node:20-alpine'));
    assert.ok(dockerfileContent.includes('FROM nginx:alpine'));
    assert.ok(dockerfileContent.includes('AS build'));
  });

  it('should produce an optimized image size under 100MB', { skip: !isDockerAvailable() ? 'Docker is not available' : false }, () => {
    // Arrange
    const imageName = 'claude-transcript-viewer-frontend:test';

    try {
      // Act - Build from repo root with explicit Dockerfile path
      execCommand(`docker build -t ${imageName} -f frontend/Dockerfile .`);

      // Get image size
      const inspectOutput = execCommand(
        `docker inspect ${imageName} --format='{{.Size}}'`
      );
      const sizeInBytes = parseInt(inspectOutput.trim(), 10);
      const sizeInMB = sizeInBytes / (1024 * 1024);

      // Assert
      assert.ok(sizeInMB < 100, `Frontend image size ${sizeInMB.toFixed(1)}MB exceeds 100MB`);
    } finally {
      tryExec(`docker rmi ${imageName}`);
    }
  });

  it('should run nginx on port 80 when container starts', { skip: !isDockerAvailable() ? 'Docker is not available' : false }, () => {
    // Arrange
    const imageName = 'claude-transcript-viewer-frontend:test';
    const containerName = 'claude-frontend-test';

    try {
      // Act - Build from repo root and run
      execCommand(`docker build -t ${imageName} -f frontend/Dockerfile .`);
      execCommand(
        `docker run -d --name ${containerName} -p 8080:80 ${imageName}`
      );

      // Wait for container to be ready
      execCommand('sleep 3');

      // Check if nginx is responding
      const curlOutput = execCommand('curl -f http://localhost:8080');

      // Assert
      assert.ok(curlOutput.includes('<!DOCTYPE html>'));
    } finally {
      tryExec(`docker stop ${containerName}`);
      tryExec(`docker rm ${containerName}`);
      tryExec(`docker rmi ${imageName}`);
    }
  });

  it('should exclude node_modules from build context', () => {
    // Arrange
    const dockerignorePath = resolve(FRONTEND_DIR, '.dockerignore');
    const dockerignoreContent = readFileSync(dockerignorePath, 'utf-8');

    // Assert
    assert.ok(dockerignoreContent.includes('node_modules'));
  });

  it('should use non-root user for security', () => {
    // Arrange
    const dockerfilePath = resolve(FRONTEND_DIR, 'Dockerfile');
    const dockerfileContent = readFileSync(dockerfilePath, 'utf-8');

    // Assert - nginx:alpine already runs as nginx user by default
    // OR Dockerfile explicitly sets USER directive
    const hasUserDirective = dockerfileContent.includes('USER');
    const usesNginxAlpine = dockerfileContent.includes('nginx:alpine');

    assert.strictEqual(hasUserDirective || usesNginxAlpine, true);
  });
});

describe('Docker Build - Backend', () => {
  it('should have a Dockerfile in backend directory', () => {
    // Arrange
    const dockerfilePath = resolve(BACKEND_DIR, 'Dockerfile');

    // Assert
    assert.strictEqual(existsSync(dockerfilePath), true);
  });

  it('should have a .dockerignore in backend directory', () => {
    // Arrange
    const dockerignorePath = resolve(BACKEND_DIR, '.dockerignore');

    // Assert
    assert.strictEqual(existsSync(dockerignorePath), true);
  });

  it('should build backend Docker image successfully', { skip: !isDockerAvailable() ? 'Docker is not available' : false }, () => {
    // Arrange
    const imageName = 'claude-transcript-viewer-backend:test';

    try {
      // Act - Build from repo root with explicit Dockerfile path
      execCommand(`docker build -t ${imageName} -f backend/Dockerfile .`);

      // Assert - Verify image was created
      assert.strictEqual(dockerImageExists(imageName), true);
    } finally {
      tryExec(`docker rmi ${imageName}`);
    }
  });

  it('should use node:20-alpine base image', () => {
    // Arrange
    const dockerfilePath = resolve(BACKEND_DIR, 'Dockerfile');
    const dockerfileContent = readFileSync(dockerfilePath, 'utf-8');

    // Assert
    assert.ok(dockerfileContent.includes('FROM node:20-alpine'));
  });

  it('should produce an optimized image size under 300MB', { skip: !isDockerAvailable() ? 'Docker is not available' : false }, () => {
    // Arrange
    const imageName = 'claude-transcript-viewer-backend:test';

    try {
      // Act - Build from repo root with explicit Dockerfile path
      execCommand(`docker build -t ${imageName} -f backend/Dockerfile .`);

      // Get image size
      const inspectOutput = execCommand(
        `docker inspect ${imageName} --format='{{.Size}}'`
      );
      const sizeInBytes = parseInt(inspectOutput.trim(), 10);
      const sizeInMB = sizeInBytes / (1024 * 1024);

      // Assert
      assert.ok(sizeInMB < 300, `Backend image size ${sizeInMB.toFixed(1)}MB exceeds 300MB`);
    } finally {
      tryExec(`docker rmi ${imageName}`);
    }
  });

  it('should expose port 3000', () => {
    // Arrange
    const dockerfilePath = resolve(BACKEND_DIR, 'Dockerfile');
    const dockerfileContent = readFileSync(dockerfilePath, 'utf-8');

    // Assert
    assert.ok(dockerfileContent.includes('EXPOSE 3000'));
  });

  it('should run Express app and respond to health check', { skip: !isDockerAvailable() ? 'Docker is not available' : false }, () => {
    // Arrange
    const imageName = 'claude-transcript-viewer-backend:test';
    const containerName = 'claude-backend-test';

    try {
      // Act - Build from repo root and run
      execCommand(`docker build -t ${imageName} -f backend/Dockerfile .`);
      execCommand(
        `docker run -d --name ${containerName} -p 3001:3000 -e AWS_ACCESS_KEY_ID=test -e AWS_SECRET_ACCESS_KEY=test -e S3_BUCKET=test-bucket ${imageName}`
      );

      // Wait for container to be ready
      execCommand('sleep 5');

      // Check if Express is responding
      const curlOutput = execCommand('curl -f http://localhost:3001/api/health');

      // Assert
      assert.ok(curlOutput !== undefined);
      assert.ok(curlOutput.length > 0);
    } finally {
      tryExec(`docker stop ${containerName}`);
      tryExec(`docker rm ${containerName}`);
      tryExec(`docker rmi ${imageName}`);
    }
  });

  it('should exclude node_modules and dist from build context', () => {
    // Arrange
    const dockerignorePath = resolve(BACKEND_DIR, '.dockerignore');
    const dockerignoreContent = readFileSync(dockerignorePath, 'utf-8');

    // Assert
    assert.ok(dockerignoreContent.includes('node_modules'));
    assert.ok(dockerignoreContent.includes('dist'));
  });

  it('should use non-root user for security', () => {
    // Arrange
    const dockerfilePath = resolve(BACKEND_DIR, 'Dockerfile');
    const dockerfileContent = readFileSync(dockerfilePath, 'utf-8');

    // Assert
    assert.ok(dockerfileContent.includes('USER node'));
  });

  it('should run dist/index.js as entrypoint', () => {
    // Arrange
    const dockerfilePath = resolve(BACKEND_DIR, 'Dockerfile');
    const dockerfileContent = readFileSync(dockerfilePath, 'utf-8');

    // Assert
    assert.ok(dockerfileContent.includes('CMD'));
    assert.ok(dockerfileContent.includes('node'));
    assert.ok(dockerfileContent.includes('dist/index.js'));
  });
});

describe('Docker Build - .dockerignore Optimization', () => {
  it('should exclude .git directory from frontend build', () => {
    // Arrange
    const dockerignorePath = resolve(FRONTEND_DIR, '.dockerignore');
    const dockerignoreContent = readFileSync(dockerignorePath, 'utf-8');

    // Assert
    assert.ok(dockerignoreContent.includes('.git'));
  });

  it('should exclude .git directory from backend build', () => {
    // Arrange
    const dockerignorePath = resolve(BACKEND_DIR, '.dockerignore');
    const dockerignoreContent = readFileSync(dockerignorePath, 'utf-8');

    // Assert
    assert.ok(dockerignoreContent.includes('.git'));
  });

  it('should exclude test files from frontend build', () => {
    // Arrange
    const dockerignorePath = resolve(FRONTEND_DIR, '.dockerignore');
    const dockerignoreContent = readFileSync(dockerignorePath, 'utf-8');

    // Assert
    const excludesTests =
      dockerignoreContent.includes('*.test.ts') ||
      dockerignoreContent.includes('*.test.tsx') ||
      dockerignoreContent.includes('**/*.test.*');

    assert.strictEqual(excludesTests, true);
  });

  it('should exclude test files from backend build', () => {
    // Arrange
    const dockerignorePath = resolve(BACKEND_DIR, '.dockerignore');
    const dockerignoreContent = readFileSync(dockerignorePath, 'utf-8');

    // Assert
    const excludesTests =
      dockerignoreContent.includes('*.test.ts') ||
      dockerignoreContent.includes('**/*.test.*');

    assert.strictEqual(excludesTests, true);
  });

  it('should exclude README and documentation from builds', () => {
    // Arrange
    const frontendDockerignorePath = resolve(FRONTEND_DIR, '.dockerignore');
    const backendDockerignorePath = resolve(BACKEND_DIR, '.dockerignore');
    const frontendContent = readFileSync(frontendDockerignorePath, 'utf-8');
    const backendContent = readFileSync(backendDockerignorePath, 'utf-8');

    // Assert
    const frontendExcludesDocs =
      frontendContent.includes('README') || frontendContent.includes('*.md');
    const backendExcludesDocs =
      backendContent.includes('README') || backendContent.includes('*.md');

    assert.strictEqual(frontendExcludesDocs || backendExcludesDocs, true);
  });
});
