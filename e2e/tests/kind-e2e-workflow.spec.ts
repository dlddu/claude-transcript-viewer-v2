import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * GitHub Actions kind E2E Workflow Tests
 *
 * These tests verify that .github/workflows/test.yml contains a kind-e2e-tests job
 * with all necessary steps to run E2E tests in a kind cluster.
 * Tests are initially failing as the workflow is not yet implemented (TDD Red Phase).
 *
 * Expected workflow structure:
 * - Job name: kind-e2e-tests
 * - Steps:
 *   1. Checkout code
 *   2. Setup pnpm
 *   3. Setup Node.js
 *   4. Install dependencies
 *   5. Create kind cluster (using helm/kind-action)
 *   6. Build Docker images (frontend and backend)
 *   7. Load images into kind cluster (kind load docker-image)
 *   8. Apply LocalStack manifests (kubectl apply -f k8s/localstack/)
 *   9. Apply backend manifests (kubectl apply -f k8s/backend/)
 *   10. Apply frontend manifests (kubectl apply -f k8s/frontend/)
 *   11. Wait for pods to be ready (kubectl wait)
 *   12. Setup port-forwarding
 *   13. Run Playwright E2E tests
 *   14. Upload Playwright report on failure
 *
 * To run these tests:
 * pnpm tsx --test e2e/tests/kind-e2e-workflow.spec.ts
 */

const REPO_ROOT = resolve(__dirname, '../..');
const WORKFLOW_PATH = resolve(REPO_ROOT, '.github/workflows/test.yml');

const containsKey = (content: string, key: string): boolean => {
  const regex = new RegExp(`^\\s*${key}\\s*:`, 'm');
  return regex.test(content);
};

const containsValue = (content: string, value: string): boolean => {
  return content.includes(value);
};

describe('GitHub Actions Workflow - File Structure', () => {
  it('should have .github/workflows/test.yml file', () => {
    // Assert
    assert.strictEqual(
      existsSync(WORKFLOW_PATH),
      true,
      '.github/workflows/test.yml should exist'
    );
  });

  it('should have valid YAML syntax', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');

    // Assert
    assert.ok(content.includes(':'), 'YAML should contain key-value pairs');
    assert.ok(!content.includes('\t'), 'YAML should use spaces, not tabs');
    assert.ok(containsKey(content, 'name'), 'Workflow should have name field');
    assert.ok(containsKey(content, 'on'), 'Workflow should have on field');
    assert.ok(containsKey(content, 'jobs'), 'Workflow should have jobs field');
  });
});

describe('GitHub Actions Workflow - kind-e2e-tests Job', () => {
  it('should have kind-e2e-tests job defined', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');

    // Assert
    assert.ok(containsValue(content, 'kind-e2e-tests'),
      'Workflow should have kind-e2e-tests job');
  });

  it('should run on ubuntu-latest', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');

    // Extract kind-e2e-tests job section
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, 'ubuntu-latest'),
      'kind-e2e-tests should run on ubuntu-latest');
  });

  it('should have name field for the job', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');

    // Extract kind-e2e-tests job section
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsKey(jobContent, 'name'),
      'kind-e2e-tests job should have a name field');
  });
});

describe('GitHub Actions Workflow - Basic Setup Steps', () => {
  it('should checkout code with actions/checkout', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, 'actions/checkout'),
      'Should use actions/checkout to checkout code');
  });

  it('should setup pnpm with pnpm/action-setup', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, 'pnpm/action-setup'),
      'Should use pnpm/action-setup to setup pnpm');
  });

  it('should setup Node.js with actions/setup-node', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, 'actions/setup-node'),
      'Should use actions/setup-node to setup Node.js');
  });

  it('should install dependencies with pnpm install', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, 'pnpm install'),
      'Should install dependencies with pnpm install');
  });
});

describe('GitHub Actions Workflow - kind Cluster Setup', () => {
  it('should create kind cluster with helm/kind-action', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, 'helm/kind-action') || containsValue(jobContent, 'kind create cluster'),
      'Should create kind cluster using helm/kind-action or kind CLI');
  });
});

describe('GitHub Actions Workflow - Docker Image Build and Load', () => {
  it('should build frontend Docker image', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, 'docker build') && containsValue(jobContent, 'frontend'),
      'Should build frontend Docker image');
  });

  it('should build backend Docker image', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, 'docker build') && containsValue(jobContent, 'backend'),
      'Should build backend Docker image');
  });

  it('should load frontend image into kind cluster', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, 'kind load') && containsValue(jobContent, 'frontend'),
      'Should load frontend Docker image into kind cluster');
  });

  it('should load backend image into kind cluster', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, 'kind load') && containsValue(jobContent, 'backend'),
      'Should load backend Docker image into kind cluster');
  });
});

describe('GitHub Actions Workflow - Kubernetes Manifest Deployment', () => {
  it('should apply LocalStack manifests to kind cluster', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(
      (containsValue(jobContent, 'kubectl apply') && containsValue(jobContent, 'localstack')) ||
      (containsValue(jobContent, 'kubectl create') && containsValue(jobContent, 'localstack')),
      'Should apply LocalStack manifests with kubectl'
    );
  });

  it('should apply backend manifests to kind cluster', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(
      (containsValue(jobContent, 'kubectl apply') && containsValue(jobContent, 'backend')) ||
      (containsValue(jobContent, 'kubectl create') && containsValue(jobContent, 'backend')),
      'Should apply backend manifests with kubectl'
    );
  });

  it('should apply frontend manifests to kind cluster', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(
      (containsValue(jobContent, 'kubectl apply') && containsValue(jobContent, 'frontend')) ||
      (containsValue(jobContent, 'kubectl create') && containsValue(jobContent, 'frontend')),
      'Should apply frontend manifests with kubectl'
    );
  });

  it('should wait for pods to be ready with kubectl wait', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, 'kubectl wait'),
      'Should wait for pods to be ready using kubectl wait');
  });
});

describe('GitHub Actions Workflow - Port Forwarding and E2E Tests', () => {
  it('should setup port-forward for services', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(
      containsValue(jobContent, 'kubectl port-forward') ||
      containsValue(jobContent, 'port-forward'),
      'Should setup port-forwarding for accessing services'
    );
  });

  it('should install Playwright browsers', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, 'playwright install'),
      'Should install Playwright browsers');
  });

  it('should run Playwright E2E tests', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(
      (containsValue(jobContent, 'pnpm') && containsValue(jobContent, 'e2e') && containsValue(jobContent, 'test')) ||
      containsValue(jobContent, 'playwright test'),
      'Should run Playwright E2E tests'
    );
  });

  it('should upload Playwright report on failure', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(
      containsValue(jobContent, 'actions/upload-artifact') &&
      (containsValue(jobContent, 'playwright-report') || containsValue(jobContent, 'playwright')),
      'Should upload Playwright report as artifact'
    );
  });

  it('should upload artifacts even if tests fail', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert - should have 'if: always()' or similar condition
    const hasAlwaysCondition =
      containsValue(jobContent, 'if: always()') ||
      containsValue(jobContent, 'if: failure()');

    assert.ok(hasAlwaysCondition,
      'Should upload artifacts even when tests fail (if: always() or if: failure())');
  });
});

describe('GitHub Actions Workflow - Best Practices', () => {
  it('should have clear step names for debugging', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert - should have 'name:' fields for steps
    const nameCount = (jobContent.match(/name:/g) || []).length;
    assert.ok(nameCount >= 5,
      'Should have descriptive step names for better readability (at least 5 steps)');
  });

  it('should not duplicate existing e2e-tests job functionality', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');

    // Assert - both jobs should exist independently
    assert.ok(containsValue(content, 'e2e-tests'),
      'Original e2e-tests job should still exist');
    assert.ok(containsValue(content, 'kind-e2e-tests'),
      'New kind-e2e-tests job should be added');

    // They should be separate jobs
    const jobsSection = content.match(/jobs:[\s\S]*$/);
    if (jobsSection) {
      const jobContent = jobsSection[0];
      const e2eTestsMatch = jobContent.match(/\n  e2e-tests:/);
      const kindE2eTestsMatch = jobContent.match(/\n  kind-e2e-tests:/);

      assert.ok(e2eTestsMatch, 'e2e-tests job should exist as top-level job');
      assert.ok(kindE2eTestsMatch, 'kind-e2e-tests job should exist as top-level job');
    }
  });

  it('should use frozen lockfile for reproducible installs', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    const jobMatch = content.match(/kind-e2e-tests:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(jobMatch, 'kind-e2e-tests job should be defined');

    const jobContent = jobMatch[0];

    // Assert
    assert.ok(containsValue(jobContent, '--frozen-lockfile'),
      'Should use --frozen-lockfile for reproducible dependency installation');
  });
});
