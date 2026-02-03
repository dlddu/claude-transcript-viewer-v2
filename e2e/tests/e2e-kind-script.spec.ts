import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Local E2E kind Script Tests
 *
 * These tests verify that scripts/e2e-kind.sh exists and contains
 * all necessary commands to run E2E tests locally using kind.
 * Tests are initially failing as the script is not yet implemented (TDD Red Phase).
 *
 * Expected script functionality:
 * 1. Check for required tools (kind, kubectl, docker, pnpm)
 * 2. Create kind cluster if it doesn't exist
 * 3. Build Docker images
 * 4. Load images into kind cluster
 * 5. Apply Kubernetes manifests (localstack, backend, frontend)
 * 6. Wait for pods to be ready
 * 7. Setup port-forwarding
 * 8. Run Playwright E2E tests
 * 9. Clean up (optional - delete kind cluster or keep for debugging)
 *
 * To run these tests:
 * pnpm tsx --test e2e/tests/e2e-kind-script.spec.ts
 */

const REPO_ROOT = resolve(__dirname, '../..');
const SCRIPTS_DIR = resolve(REPO_ROOT, 'scripts');
const SCRIPT_PATH = resolve(SCRIPTS_DIR, 'e2e-kind.sh');

describe('E2E kind Script - File Structure', () => {
  it('should have scripts directory', () => {
    // Assert
    assert.strictEqual(
      existsSync(SCRIPTS_DIR),
      true,
      'scripts directory should exist at repository root'
    );
  });

  it('should have e2e-kind.sh file', () => {
    // Assert
    assert.strictEqual(
      existsSync(SCRIPT_PATH),
      true,
      'e2e-kind.sh should exist in scripts directory'
    );
  });

  it('should be executable', () => {
    // Arrange & Assert
    const stats = statSync(SCRIPT_PATH);
    const isExecutable = !!(stats.mode & 0o111);

    assert.ok(isExecutable,
      'e2e-kind.sh should have executable permissions (chmod +x)');
  });

  it('should be a shell script with shebang', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.startsWith('#!'),
      'Script should start with shebang (#!)');
    assert.ok(content.startsWith('#!/bin/bash') || content.startsWith('#!/usr/bin/env bash'),
      'Script should use bash interpreter');
  });
});

describe('E2E kind Script - Prerequisites Check', () => {
  it('should check for kind availability', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('kind') && (content.includes('command -v') || content.includes('which')),
      'Script should check if kind is installed');
  });

  it('should check for kubectl availability', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('kubectl') && (content.includes('command -v') || content.includes('which')),
      'Script should check if kubectl is installed');
  });

  it('should check for docker availability', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('docker') && (content.includes('command -v') || content.includes('which')),
      'Script should check if docker is installed');
  });

  it('should check for pnpm availability', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('pnpm') && (content.includes('command -v') || content.includes('which')),
      'Script should check if pnpm is installed');
  });

  it('should exit with error if prerequisites are missing', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('exit 1') || content.includes('return 1'),
      'Script should exit with error code if prerequisites are missing');
  });
});

describe('E2E kind Script - Cluster Creation', () => {
  it('should create kind cluster', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('kind create cluster'),
      'Script should create kind cluster');
  });

  it('should check if cluster already exists before creating', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kind get clusters') ||
      content.includes('kind get cluster') ||
      content.includes('kubectl cluster-info'),
      'Script should check if kind cluster already exists'
    );
  });

  it('should use a named cluster for consistency', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('--name') && content.includes('kind create cluster'),
      'Script should create cluster with a specific name (--name flag)');
  });
});

describe('E2E kind Script - Docker Image Build', () => {
  it('should build frontend Docker image', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('docker build') && content.includes('frontend'),
      'Script should build frontend Docker image');
  });

  it('should build backend Docker image', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('docker build') && content.includes('backend'),
      'Script should build backend Docker image');
  });

  it('should tag Docker images appropriately', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(
      (content.includes('docker build') && content.includes('-t')) ||
      (content.includes('docker build') && content.includes('--tag')),
      'Script should tag Docker images with -t or --tag flag'
    );
  });
});

describe('E2E kind Script - Load Images into kind', () => {
  it('should load frontend image into kind cluster', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('kind load') && content.includes('frontend'),
      'Script should load frontend Docker image into kind cluster');
  });

  it('should load backend image into kind cluster', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('kind load') && content.includes('backend'),
      'Script should load backend Docker image into kind cluster');
  });

  it('should use docker-image subcommand for loading images', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('kind load docker-image') || content.includes('kind load image'),
      'Script should use kind load docker-image command');
  });
});

describe('E2E kind Script - Deploy Kubernetes Manifests', () => {
  it('should apply LocalStack manifests', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(
      (content.includes('kubectl apply') && content.includes('localstack')) ||
      (content.includes('kubectl create') && content.includes('localstack')),
      'Script should apply LocalStack Kubernetes manifests'
    );
  });

  it('should apply backend manifests', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(
      (content.includes('kubectl apply') && content.includes('backend')) ||
      (content.includes('kubectl create') && content.includes('backend')),
      'Script should apply backend Kubernetes manifests'
    );
  });

  it('should apply frontend manifests', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(
      (content.includes('kubectl apply') && content.includes('frontend')) ||
      (content.includes('kubectl create') && content.includes('frontend')),
      'Script should apply frontend Kubernetes manifests'
    );
  });

  it('should apply manifests in correct order (localstack first)', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Find positions of kubectl apply commands
    const localstackPos = content.search(/kubectl (apply|create).*localstack/);
    const backendPos = content.search(/kubectl (apply|create).*backend/);
    const frontendPos = content.search(/kubectl (apply|create).*frontend/);

    // Assert - LocalStack should be deployed before backend
    if (localstackPos !== -1 && backendPos !== -1) {
      assert.ok(localstackPos < backendPos,
        'LocalStack manifests should be applied before backend manifests');
    }
  });
});

describe('E2E kind Script - Wait for Pods Ready', () => {
  it('should wait for pods to be ready', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('kubectl wait'),
      'Script should wait for pods to be ready using kubectl wait');
  });

  it('should wait for condition=ready', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(
      content.includes('condition=ready') || content.includes('condition=Ready'),
      'Script should wait for pods with condition=ready'
    );
  });

  it('should have a timeout for waiting', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('--timeout') || content.includes('timeout'),
      'Script should have a timeout when waiting for pods');
  });
});

describe('E2E kind Script - Port Forwarding', () => {
  it('should setup port-forward for services', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('kubectl port-forward'),
      'Script should setup port-forwarding for accessing services');
  });

  it('should run port-forward in background', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kubectl port-forward') && content.includes('&'),
      'Script should run port-forward in background using &'
    );
  });
});

describe('E2E kind Script - Run E2E Tests', () => {
  it('should install dependencies with pnpm', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('pnpm install'),
      'Script should install dependencies with pnpm install');
  });

  it('should install Playwright browsers', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes('playwright install'),
      'Script should install Playwright browsers');
  });

  it('should run Playwright E2E tests', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(
      (content.includes('pnpm') && content.includes('test') && content.includes('e2e')) ||
      content.includes('playwright test'),
      'Script should run Playwright E2E tests'
    );
  });
});

describe('E2E kind Script - Cleanup and Error Handling', () => {
  it('should have error handling with set -e or error checks', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(
      content.includes('set -e') ||
      content.includes('set -o errexit') ||
      content.includes('|| exit'),
      'Script should have error handling (set -e or manual error checks)'
    );
  });

  it('should provide cleanup option or instructions', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert - either cleanup code or comments about cleanup
    assert.ok(
      content.includes('kind delete cluster') ||
      content.includes('cleanup') ||
      content.includes('Cleanup') ||
      content.includes('delete cluster'),
      'Script should provide cleanup option or instructions for deleting kind cluster'
    );
  });

  it('should include usage instructions or help text', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(
      content.includes('Usage:') ||
      content.includes('usage') ||
      content.includes('help') ||
      content.includes('--help') ||
      content.includes('echo') && content.includes('script'),
      'Script should include usage instructions or help text'
    );
  });
});

describe('E2E kind Script - Best Practices', () => {
  it('should have informative comments', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert - count comment lines
    const commentLines = content.split('\n').filter(line =>
      line.trim().startsWith('#') && !line.startsWith('#!')
    ).length;

    assert.ok(commentLines >= 5,
      'Script should have informative comments (at least 5 comment lines)');
  });

  it('should use echo for user feedback on progress', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    const echoCount = (content.match(/echo/g) || []).length;
    assert.ok(echoCount >= 3,
      'Script should use echo statements to provide user feedback (at least 3)');
  });

  it('should be idempotent (safe to run multiple times)', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert - should have checks before destructive operations
    assert.ok(
      content.includes('if') || content.includes('[ ') || content.includes('[[ '),
      'Script should have conditional checks for idempotency'
    );
  });

  it('should reference k8s manifest paths correctly', () => {
    // Arrange
    const content = readFileSync(SCRIPT_PATH, 'utf-8');

    // Assert
    assert.ok(
      content.includes('k8s/localstack') ||
      content.includes('k8s/backend') ||
      content.includes('k8s/frontend'),
      'Script should reference k8s manifest directories'
    );
  });
});
