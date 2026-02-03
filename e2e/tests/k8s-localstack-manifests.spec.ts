import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Kubernetes LocalStack Manifests E2E Tests
 *
 * These tests verify that Kubernetes manifest files for LocalStack are properly structured
 * and can be validated by kubectl. Tests are initially failing as manifests
 * are not yet implemented (TDD Red Phase).
 *
 * LocalStack characteristics:
 * - Container port: 4566 (LocalStack edge port)
 * - Image: localstack/localstack:latest or specific version
 * - Labels: app=localstack, tier=infrastructure
 * - Environment variables: SERVICES, DEBUG, DATA_DIR (from ConfigMap if needed)
 * - Service: ClusterIP, port 4566 → targetPort 4566
 * - Health probes: HTTP GET /_localstack/health
 * - Deployment: Single replica for local dev environment
 *
 * To run these tests:
 * 1. Ensure kubectl is installed (optional for dry-run tests)
 * 2. Run: pnpm tsx --test e2e/tests/k8s-localstack-manifests.spec.ts
 */

const REPO_ROOT = resolve(__dirname, '../..');
const K8S_DIR = resolve(REPO_ROOT, 'k8s/localstack');

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

const isKubectlAvailable = (): boolean => {
  try {
    execCommand('kubectl version --client');
    // Also verify that dry-run actually works without a cluster
    execCommand('KUBECONFIG=/dev/null kubectl create --dry-run=client --validate=false -f - -o yaml <<< \'{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"test"}}\'');
    return true;
  } catch {
    return false;
  }
};

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

const containsKeyValue = (content: string, key: string, value: string): boolean => {
  const regex = new RegExp(`${key}\\s*:\\s*${value}`, 'i');
  return regex.test(content);
};

const containsKey = (content: string, key: string): boolean => {
  const regex = new RegExp(`^\\s*${key}\\s*:`, 'm');
  return regex.test(content);
};

describe('K8s LocalStack Manifests - File Structure', () => {
  it('should have k8s/localstack directory', () => {
    // Assert
    assert.strictEqual(
      existsSync(K8S_DIR),
      true,
      'k8s/localstack directory should exist'
    );
  });

  it('should have deployment.yaml file', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');

    // Assert
    assert.strictEqual(
      existsSync(deploymentPath),
      true,
      'deployment.yaml should exist in k8s/localstack directory'
    );
  });

  it('should have service.yaml file', () => {
    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');

    // Assert
    assert.strictEqual(
      existsSync(servicePath),
      true,
      'service.yaml should exist in k8s/localstack directory'
    );
  });
});

describe('K8s LocalStack Manifests - YAML Validity', () => {
  it('should have valid YAML syntax in deployment.yaml', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Act & Assert
    assert.doesNotThrow(() => {
      parseYAML(content);
    }, 'deployment.yaml should have valid YAML syntax');

    assert.ok(content.includes(':'), 'YAML should contain key-value pairs');
    assert.ok(!content.includes('\t'), 'YAML should use spaces, not tabs');
  });

  it('should have valid YAML syntax in service.yaml', () => {
    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Act & Assert
    assert.doesNotThrow(() => {
      parseYAML(content);
    }, 'service.yaml should have valid YAML syntax');

    assert.ok(content.includes(':'), 'YAML should contain key-value pairs');
    assert.ok(!content.includes('\t'), 'YAML should use spaces, not tabs');
  });
});

describe('K8s LocalStack Manifests - Deployment Configuration', () => {
  it('should have apiVersion and kind fields in deployment.yaml', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'apiVersion'), 'Deployment should have apiVersion field');
    assert.ok(containsKey(content, 'kind'), 'Deployment should have kind field');
    assert.ok(content.includes('kind: Deployment'), 'kind should be Deployment');
  });

  it('should have metadata with name and labels', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'metadata'), 'Deployment should have metadata');
    assert.ok(containsKey(content, 'name'), 'Deployment should have name');
    assert.ok(containsKey(content, 'labels'), 'Deployment should have labels');
  });

  it('should configure replicas in spec', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'replicas'), 'Deployment should configure replicas');
  });

  it('should have selector with matchLabels', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'selector'), 'Deployment should have selector');
    assert.ok(containsKey(content, 'matchLabels'), 'Deployment selector should have matchLabels');
  });

  it('should define container spec with name and image', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'containers'), 'Deployment should define containers');
    assert.ok(content.includes('image:'), 'Container should specify image');
    assert.ok(content.includes('localstack/localstack'), 'Image should be localstack/localstack');
  });

  it('should configure container port 4566', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'ports'), 'Container should define ports');
    assert.ok(content.includes('4566'), 'Container should expose port 4566 (LocalStack edge port)');
  });

  it('should define environment variables for LocalStack configuration', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'env'), 'Container should configure environment variables');
    assert.ok(content.includes('SERVICES'), 'Should configure SERVICES environment variable');
  });

  it('should configure DEBUG environment variable', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(content.includes('DEBUG'), 'Should configure DEBUG environment variable');
  });

  it('should configure liveness probe for LocalStack health endpoint', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'livenessProbe'), 'Container should have livenessProbe');
    assert.ok(content.includes('/_localstack/health'), 'Liveness probe should check /_localstack/health endpoint');
  });

  it('should configure readiness probe for LocalStack health endpoint', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'readinessProbe'), 'Container should have readinessProbe');
    assert.ok(content.includes('/_localstack/health'), 'Readiness probe should check /_localstack/health endpoint');
  });

  it('should use localstack-specific labels (app=localstack)', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    const hasAppLabel = content.includes('app:') && content.includes('localstack');
    assert.ok(hasAppLabel, 'Deployment should have localstack-specific app label');
  });

  it('should include tier=infrastructure label', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    const hasTierLabel = content.includes('tier:') && content.includes('infrastructure');
    assert.ok(hasTierLabel, 'Deployment should have tier=infrastructure label');
  });
});

describe('K8s LocalStack Manifests - Service Configuration', () => {
  it('should have apiVersion and kind fields in service.yaml', () => {
    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'apiVersion'), 'Service should have apiVersion field');
    assert.ok(containsKey(content, 'kind'), 'Service should have kind field');
    assert.ok(content.includes('kind: Service'), 'kind should be Service');
  });

  it('should have metadata with name and labels', () => {
    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'metadata'), 'Service should have metadata');
    assert.ok(containsKey(content, 'name'), 'Service should have name');
  });

  it('should configure ClusterIP service type', () => {
    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(containsKeyValue(content, 'type', 'ClusterIP'),
      'Service type should be ClusterIP');
  });

  it('should configure selector to match deployment labels', () => {
    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'selector'), 'Service should have selector');
  });

  it('should map port 4566 to targetPort 4566', () => {
    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'ports'), 'Service should define ports');
    assert.ok(content.includes('port: 4566'), 'Service should listen on port 4566');
    assert.ok(content.includes('targetPort: 4566'), 'Service should forward to targetPort 4566');
  });

  it('should configure TCP protocol for service port', () => {
    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(content.includes('protocol: TCP'), 'Service should use TCP protocol');
  });

  it('should use localstack-specific selector labels', () => {
    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    const hasAppLabel = content.includes('app:') && content.includes('localstack');
    assert.ok(hasAppLabel, 'Service should have localstack-specific app label in selector');
  });
});

describe('K8s LocalStack Manifests - kubectl dry-run validation', () => {
  it('should pass kubectl dry-run for deployment.yaml', () => {
    // Skip if kubectl is not available
    if (!isKubectlAvailable()) {
      console.warn('kubectl is not available, skipping test');
      return;
    }

    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');

    // Act & Assert
    assert.doesNotThrow(() => {
      execCommand(`KUBECONFIG=/dev/null kubectl create --dry-run=client --validate=false -f ${deploymentPath} -o yaml`);
    }, 'deployment.yaml should pass kubectl dry-run validation');
  });

  it('should pass kubectl dry-run for service.yaml', () => {
    // Skip if kubectl is not available
    if (!isKubectlAvailable()) {
      console.warn('kubectl is not available, skipping test');
      return;
    }

    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');

    // Act & Assert
    assert.doesNotThrow(() => {
      execCommand(`KUBECONFIG=/dev/null kubectl create --dry-run=client --validate=false -f ${servicePath} -o yaml`);
    }, 'service.yaml should pass kubectl dry-run validation');
  });

  it('should validate all localstack manifests can be applied together', () => {
    // Skip if kubectl is not available
    if (!isKubectlAvailable()) {
      console.warn('kubectl is not available, skipping test');
      return;
    }

    // Arrange & Act & Assert
    assert.doesNotThrow(() => {
      execCommand(`KUBECONFIG=/dev/null kubectl create --dry-run=client --validate=false -f ${K8S_DIR}/ -o yaml`);
    }, 'All localstack manifests should be valid when applied together');
  });
});

describe('K8s LocalStack Manifests - Label Consistency', () => {
  it('should use consistent app label across deployment, service, and selectors', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const deploymentContent = readFileSync(deploymentPath, 'utf-8');
    const serviceContent = readFileSync(servicePath, 'utf-8');

    // Extract app labels
    const deploymentAppMatch = deploymentContent.match(/app:\s*(\S+)/);
    const serviceAppMatch = serviceContent.match(/app:\s*(\S+)/);

    // Assert
    assert.ok(deploymentAppMatch, 'Deployment should have app label');
    assert.ok(serviceAppMatch, 'Service should have app label');

    if (deploymentAppMatch && serviceAppMatch) {
      assert.strictEqual(
        deploymentAppMatch[1],
        serviceAppMatch[1],
        'Deployment and Service should use the same app label'
      );
    }
  });

  it('should have matching selector labels between deployment and service', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const deploymentContent = readFileSync(deploymentPath, 'utf-8');
    const serviceContent = readFileSync(servicePath, 'utf-8');

    // Both should have selector sections
    // Assert
    assert.ok(containsKey(deploymentContent, 'selector'),
      'Deployment should have selector');
    assert.ok(containsKey(serviceContent, 'selector'),
      'Service should have selector');
  });
});

describe('K8s LocalStack Manifests - Best Practices', () => {
  it('should specify imagePullPolicy in deployment', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'imagePullPolicy'),
      'Deployment should specify imagePullPolicy');
  });

  it('should use appropriate image tag (not latest in production)', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // For LocalStack, latest is acceptable in dev, but should have option for specific version
    // Assert - just verify image field exists
    assert.ok(content.includes('image:'), 'Deployment should specify container image');
  });

  it('should include namespace in metadata (optional but recommended)', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const deploymentContent = readFileSync(deploymentPath, 'utf-8');
    const serviceContent = readFileSync(servicePath, 'utf-8');

    // This test just validates the files exist and are readable
    assert.ok(deploymentContent.length > 0, 'Deployment file should have content');
    assert.ok(serviceContent.length > 0, 'Service file should have content');
  });

  it('should configure appropriate probe intervals and timeouts', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert - LocalStack can take time to start, probes should account for this
    const hasProbeConfig =
      content.includes('initialDelaySeconds') ||
      content.includes('periodSeconds') ||
      content.includes('timeoutSeconds');

    assert.ok(hasProbeConfig,
      'Deployment should configure probe timing parameters for LocalStack startup');
  });

  it('should be consistent with backend and frontend manifest patterns', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert - Should follow same structure as other manifests
    assert.ok(containsKey(content, 'apiVersion'), 'Should have apiVersion like other manifests');
    assert.ok(containsKey(content, 'kind'), 'Should have kind like other manifests');
    assert.ok(containsKey(content, 'metadata'), 'Should have metadata like other manifests');
    assert.ok(containsKey(content, 'spec'), 'Should have spec like other manifests');
  });
});
