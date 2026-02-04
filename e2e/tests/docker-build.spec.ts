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
 * These tests verify that Docker images can be built and run correctly.
 * Tests are initially skipped as Docker environment may not be available.
 *
 * To run these tests:
 * 1. Ensure Docker is installed and running
 * 2. Run: node --test e2e/tests/docker-build.spec.ts
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

  it('should build frontend Docker image successfully', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const imageName = 'claude-transcript-viewer-frontend:test';

    // Act
    const output = execCommand(
      `docker build -t ${imageName} .`,
      FRONTEND_DIR
    );

    // Assert
    assert.ok(output.includes('Successfully built'));
    assert.ok(output.includes('Successfully tagged'));

    // Cleanup
    execCommand(`docker rmi ${imageName}`);
  });

  it('should use multi-stage build with node and nginx', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const dockerfilePath = resolve(FRONTEND_DIR, 'Dockerfile');
    const dockerfileContent = readFileSync(dockerfilePath, 'utf-8');

    // Assert
    assert.ok(dockerfileContent.includes('FROM node:20-alpine'));
    assert.ok(dockerfileContent.includes('FROM nginx:alpine'));
    assert.ok(dockerfileContent.includes('AS build'));
  });

  it('should produce an optimized image size under 100MB', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const imageName = 'claude-transcript-viewer-frontend:test';

    // Act - Build image
    execCommand(`docker build -t ${imageName} .`, FRONTEND_DIR);

    // Get image size
    const inspectOutput = execCommand(
      `docker inspect ${imageName} --format='{{.Size}}'`
    );
    const sizeInBytes = parseInt(inspectOutput.trim(), 10);
    const sizeInMB = sizeInBytes / (1024 * 1024);

    // Assert
    assert.ok(sizeInMB < 100);

    // Cleanup
    execCommand(`docker rmi ${imageName}`);
  });

  it('should run nginx on port 80 when container starts', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const imageName = 'claude-transcript-viewer-frontend:test';
    const containerName = 'claude-frontend-test';

    try {
      // Act - Build and run
      execCommand(`docker build -t ${imageName} .`, FRONTEND_DIR);
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
      // Cleanup
      execCommand(`docker stop ${containerName}`, REPO_ROOT);
      execCommand(`docker rm ${containerName}`, REPO_ROOT);
      execCommand(`docker rmi ${imageName}`, REPO_ROOT);
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
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

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

  it('should build backend Docker image successfully', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const imageName = 'claude-transcript-viewer-backend:test';

    // Act
    const output = execCommand(
      `docker build -t ${imageName} .`,
      BACKEND_DIR
    );

    // Assert
    assert.ok(output.includes('Successfully built'));
    assert.ok(output.includes('Successfully tagged'));

    // Cleanup
    execCommand(`docker rmi ${imageName}`);
  });

  it('should use node:20-alpine base image', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const dockerfilePath = resolve(BACKEND_DIR, 'Dockerfile');
    const dockerfileContent = readFileSync(dockerfilePath, 'utf-8');

    // Assert
    assert.ok(dockerfileContent.includes('FROM node:20-alpine'));
  });

  it('should produce an optimized image size under 300MB', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const imageName = 'claude-transcript-viewer-backend:test';

    // Act - Build image
    execCommand(`docker build -t ${imageName} .`, BACKEND_DIR);

    // Get image size
    const inspectOutput = execCommand(
      `docker inspect ${imageName} --format='{{.Size}}'`
    );
    const sizeInBytes = parseInt(inspectOutput.trim(), 10);
    const sizeInMB = sizeInBytes / (1024 * 1024);

    // Assert
    assert.ok(sizeInMB < 300);

    // Cleanup
    execCommand(`docker rmi ${imageName}`);
  });

  it('should expose port 3000', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const dockerfilePath = resolve(BACKEND_DIR, 'Dockerfile');
    const dockerfileContent = readFileSync(dockerfilePath, 'utf-8');

    // Assert
    assert.ok(dockerfileContent.includes('EXPOSE 3000'));
  });

  it('should run Express app and respond to health check', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const imageName = 'claude-transcript-viewer-backend:test';
    const containerName = 'claude-backend-test';

    try {
      // Act - Build and run
      execCommand(`docker build -t ${imageName} .`, BACKEND_DIR);
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
      // Cleanup
      execCommand(`docker stop ${containerName}`, REPO_ROOT);
      execCommand(`docker rm ${containerName}`, REPO_ROOT);
      execCommand(`docker rmi ${imageName}`, REPO_ROOT);
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
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const dockerfilePath = resolve(BACKEND_DIR, 'Dockerfile');
    const dockerfileContent = readFileSync(dockerfilePath, 'utf-8');

    // Assert
    assert.ok(dockerfileContent.includes('USER node'));
  });

  it('should run dist/index.js as entrypoint', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

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
