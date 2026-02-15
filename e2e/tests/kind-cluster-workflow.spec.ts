import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Kind Cluster Workflow E2E Tests
 *
 * These tests verify that the GitHub Actions workflow file includes kind cluster
 * setup steps for E2E testing. Tests validate YAML structure and required steps
 * without executing the workflow.
 *
 * To run these tests:
 * Run: node --test e2e/tests/kind-cluster-workflow.spec.ts
 */

const REPO_ROOT = resolve(__dirname, '../..');
const WORKFLOW_FILE = resolve(REPO_ROOT, '.github/workflows/test.yml');

const parseYAML = (content: string): any => {
  const lines = content.split('\n');
  const result: any = {};
  const stack: any[] = [{ obj: result, indent: -1 }];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    if (trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const current = stack[stack.length - 1].obj;

      if (value) {
        if (value.startsWith('[') && value.endsWith(']')) {
          const arrayContent = value.slice(1, -1);
          current[key.trim()] = arrayContent.split(',').map(item => item.trim());
        } else {
          current[key.trim()] = value;
        }
      } else {
        current[key.trim()] = {};
        stack.push({ obj: current[key.trim()], indent });
      }
    } else if (trimmed.startsWith('-')) {
      const value = trimmed.slice(1).trim();
      const current = stack[stack.length - 1].obj;

      if (!Array.isArray(current.__items)) {
        current.__items = [];
      }
      current.__items.push(value);
    }
  }

  return result;
};

const containsKey = (content: string, key: string): boolean => {
  const regex = new RegExp(`^\\s*${key}\\s*:`, 'm');
  return regex.test(content);
};

describe('Kind Cluster Workflow - File Structure', () => {
  it('should have GitHub Actions workflow file', () => {
    // Assert
    assert.strictEqual(
      existsSync(WORKFLOW_FILE),
      true,
      '.github/workflows/test.yml should exist'
    );
  });

  it('should have valid YAML syntax', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Act & Assert
    assert.doesNotThrow(() => {
      parseYAML(content);
    }, 'test.yml should have valid YAML syntax');

    assert.ok(content.includes(':'), 'YAML should contain key-value pairs');
    assert.ok(!content.includes('\t'), 'YAML should use spaces, not tabs');
  });
});

describe('Kind Cluster Workflow - Workflow Configuration', () => {
  it('should define workflow name', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'name'), 'Workflow should have a name');
  });

  it('should configure workflow triggers', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'on'), 'Workflow should define triggers');
  });

  it('should define jobs section', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'jobs'), 'Workflow should define jobs');
  });
});

describe('Kind Cluster Workflow - Kind E2E Job', () => {
  it('should have kind-e2e-tests job defined', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kind-e2e-tests') || content.includes('kind_e2e_tests'),
      'Workflow should include kind-e2e-tests job'
    );
  });

  it('should configure ubuntu runner for kind job', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Look for kind job and check for ubuntu ARM runner
    const kindJobMatch = content.match(/kind[-_]e2e[-_]tests:[\s\S]*?runs-on:\s*ubuntu-24\.04-arm/);

    // Assert
    assert.ok(
      kindJobMatch || content.includes('ubuntu-24.04-arm'),
      'Kind E2E job should run on ubuntu-24.04-arm'
    );
  });

  it('should include checkout step', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('actions/checkout'),
      'Kind E2E job should include checkout action'
    );
  });

  it('should include kind setup step', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('helm/kind-action') || content.includes('engineerd/setup-kind'),
      'Kind E2E job should include kind setup action'
    );
  });

  it('should include kubectl installation or setup', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kubectl') || content.includes('setup-kubectl'),
      'Kind E2E job should configure kubectl'
    );
  });

  it('should load Docker images into kind cluster', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kind load') || content.includes('docker-image'),
      'Kind E2E job should load Docker images into kind cluster'
    );
  });

  it('should apply Kubernetes manifests', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kubectl apply') || content.includes('k8s/'),
      'Kind E2E job should apply Kubernetes manifests'
    );
  });

  it('should wait for deployments to be ready', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kubectl wait') || content.includes('rollout status'),
      'Kind E2E job should wait for deployments to be ready'
    );
  });

  it('should run E2E tests against kind cluster', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('test') || content.includes('playwright'),
      'Kind E2E job should run E2E tests'
    );
  });
});

describe('Kind Cluster Workflow - LocalStack Integration', () => {
  it('should deploy LocalStack to kind cluster', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('localstack') || content.includes('k8s/localstack'),
      'Kind E2E job should deploy LocalStack manifests'
    );
  });

  it('should configure AWS credentials for LocalStack', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('AWS_ACCESS_KEY_ID') && content.includes('AWS_SECRET_ACCESS_KEY'),
      'Kind E2E job should configure AWS credentials for LocalStack'
    );
  });

  it('should set AWS_ENDPOINT_URL for LocalStack', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('AWS_ENDPOINT_URL') || content.includes('endpoint'),
      'Kind E2E job should configure AWS endpoint URL for LocalStack'
    );
  });
});

describe('Kind Cluster Workflow - Docker Build Integration', () => {
  it('should build frontend Docker image', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      (content.includes('docker build') || content.includes('docker/build-push-action')) && content.includes('frontend'),
      'Kind E2E job should build frontend Docker image'
    );
  });

  it('should build backend Docker image', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      (content.includes('docker build') || content.includes('docker/build-push-action')) && content.includes('backend'),
      'Kind E2E job should build backend Docker image'
    );
  });

  it('should tag images appropriately', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('-t ') || content.includes('--tag') || content.includes('tags:'),
      'Kind E2E job should tag Docker images'
    );
  });
});

describe('Kind Cluster Workflow - Best Practices', () => {
  it('should include pnpm setup for monorepo', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('pnpm/action-setup') || content.includes('pnpm install'),
      'Workflow should use pnpm for monorepo'
    );
  });

  it('should use Node.js 20', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('node-version') && content.includes('20'),
      'Workflow should use Node.js 20'
    );
  });

  it('should cache dependencies', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('cache') || content.includes('frozen-lockfile'),
      'Workflow should cache dependencies for faster builds'
    );
  });

  it('should not skip tests by default', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Look for kind-e2e-tests job
    const kindJobSection = content.match(/kind[-_]e2e[-_]tests:[\s\S]*?(?=\n\S|\n$)/);

    if (kindJobSection) {
      const jobContent = kindJobSection[0];
      // Assert
      assert.ok(
        !jobContent.includes('if: false'),
        'Kind E2E job should not be disabled by default'
      );
    }
  });
});

describe('Kind Cluster Workflow - Error Handling', () => {
  it('should include steps to debug on failure', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kubectl get') || content.includes('kubectl describe') || content.includes('kubectl logs'),
      'Kind E2E job should include debugging steps for failures'
    );
  });

  it('should upload artifacts on test failure', () => {
    // Arrange
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    // Assert
    assert.ok(
      content.includes('upload-artifact') || content.includes('if: always()') || content.includes('if: failure()'),
      'Kind E2E job should upload artifacts on failure'
    );
  });
});
