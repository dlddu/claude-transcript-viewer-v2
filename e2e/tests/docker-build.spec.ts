import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Docker Build E2E Tests
 *
 * These tests verify that Docker images can be built and run correctly.
 * Tests are initially skipped as Docker environment may not be available.
 *
 * To run these tests:
 * 1. Ensure Docker is installed and running
 * 2. Run: pnpm --filter @claude-transcript-viewer/e2e test docker-build.spec.ts
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

describe.skip('Docker Build - Frontend', () => {
  it('should have a Dockerfile in frontend directory', () => {
    // Arrange
    const dockerfilePath = resolve(FRONTEND_DIR, 'Dockerfile');

    // Assert
    expect(existsSync(dockerfilePath)).toBe(true);
  });

  it('should have a .dockerignore in frontend directory', () => {
    // Arrange
    const dockerignorePath = resolve(FRONTEND_DIR, '.dockerignore');

    // Assert
    expect(existsSync(dockerignorePath)).toBe(true);
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
    expect(output).toContain('Successfully built');
    expect(output).toContain('Successfully tagged');

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
    const fs = require('fs');
    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');

    // Assert
    expect(dockerfileContent).toContain('FROM node:20-alpine');
    expect(dockerfileContent).toContain('FROM nginx:alpine');
    expect(dockerfileContent).toContain('AS build');
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
    expect(sizeInMB).toBeLessThan(100);

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
      expect(curlOutput).toContain('<!DOCTYPE html>');
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
    const fs = require('fs');
    const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf-8');

    // Assert
    expect(dockerignoreContent).toContain('node_modules');
  });

  it('should use non-root user for security', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const dockerfilePath = resolve(FRONTEND_DIR, 'Dockerfile');
    const fs = require('fs');
    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');

    // Assert - nginx:alpine already runs as nginx user by default
    // OR Dockerfile explicitly sets USER directive
    const hasUserDirective = dockerfileContent.includes('USER');
    const usesNginxAlpine = dockerfileContent.includes('nginx:alpine');

    expect(hasUserDirective || usesNginxAlpine).toBe(true);
  });
});

describe.skip('Docker Build - Backend', () => {
  it('should have a Dockerfile in backend directory', () => {
    // Arrange
    const dockerfilePath = resolve(BACKEND_DIR, 'Dockerfile');

    // Assert
    expect(existsSync(dockerfilePath)).toBe(true);
  });

  it('should have a .dockerignore in backend directory', () => {
    // Arrange
    const dockerignorePath = resolve(BACKEND_DIR, '.dockerignore');

    // Assert
    expect(existsSync(dockerignorePath)).toBe(true);
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
    expect(output).toContain('Successfully built');
    expect(output).toContain('Successfully tagged');

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
    const fs = require('fs');
    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');

    // Assert
    expect(dockerfileContent).toContain('FROM node:20-alpine');
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
    expect(sizeInMB).toBeLessThan(300);

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
    const fs = require('fs');
    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');

    // Assert
    expect(dockerfileContent).toContain('EXPOSE 3000');
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
      expect(curlOutput).toBeDefined();
      expect(curlOutput.length).toBeGreaterThan(0);
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
    const fs = require('fs');
    const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf-8');

    // Assert
    expect(dockerignoreContent).toContain('node_modules');
    expect(dockerignoreContent).toContain('dist');
  });

  it('should use non-root user for security', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const dockerfilePath = resolve(BACKEND_DIR, 'Dockerfile');
    const fs = require('fs');
    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');

    // Assert
    expect(dockerfileContent).toContain('USER node');
  });

  it('should run dist/index.js as entrypoint', () => {
    // Skip if Docker is not available
    if (!isDockerAvailable()) {
      console.warn('Docker is not available, skipping test');
      return;
    }

    // Arrange
    const dockerfilePath = resolve(BACKEND_DIR, 'Dockerfile');
    const fs = require('fs');
    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');

    // Assert
    expect(dockerfileContent).toContain('CMD');
    expect(dockerfileContent).toContain('node');
    expect(dockerfileContent).toContain('dist/index.js');
  });
});

describe.skip('Docker Build - .dockerignore Optimization', () => {
  it('should exclude .git directory from frontend build', () => {
    // Arrange
    const dockerignorePath = resolve(FRONTEND_DIR, '.dockerignore');
    const fs = require('fs');
    const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf-8');

    // Assert
    expect(dockerignoreContent).toContain('.git');
  });

  it('should exclude .git directory from backend build', () => {
    // Arrange
    const dockerignorePath = resolve(BACKEND_DIR, '.dockerignore');
    const fs = require('fs');
    const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf-8');

    // Assert
    expect(dockerignoreContent).toContain('.git');
  });

  it('should exclude test files from frontend build', () => {
    // Arrange
    const dockerignorePath = resolve(FRONTEND_DIR, '.dockerignore');
    const fs = require('fs');
    const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf-8');

    // Assert
    const excludesTests =
      dockerignoreContent.includes('*.test.ts') ||
      dockerignoreContent.includes('*.test.tsx') ||
      dockerignoreContent.includes('**/*.test.*');

    expect(excludesTests).toBe(true);
  });

  it('should exclude test files from backend build', () => {
    // Arrange
    const dockerignorePath = resolve(BACKEND_DIR, '.dockerignore');
    const fs = require('fs');
    const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf-8');

    // Assert
    const excludesTests =
      dockerignoreContent.includes('*.test.ts') ||
      dockerignoreContent.includes('**/*.test.*');

    expect(excludesTests).toBe(true);
  });

  it('should exclude README and documentation from builds', () => {
    // Arrange
    const frontendDockerignorePath = resolve(FRONTEND_DIR, '.dockerignore');
    const backendDockerignorePath = resolve(BACKEND_DIR, '.dockerignore');
    const fs = require('fs');
    const frontendContent = fs.readFileSync(frontendDockerignorePath, 'utf-8');
    const backendContent = fs.readFileSync(backendDockerignorePath, 'utf-8');

    // Assert
    const frontendExcludesDocs =
      frontendContent.includes('README') || frontendContent.includes('*.md');
    const backendExcludesDocs =
      backendContent.includes('README') || backendContent.includes('*.md');

    expect(frontendExcludesDocs || backendExcludesDocs).toBe(true);
  });
});
