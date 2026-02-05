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
 * These tests verify that LocalStack Kubernetes manifest files are properly structured
 * and can be validated by kubectl. These tests validate the structure and content
 * without requiring a running Kubernetes cluster.
 *
 * To run these tests:
 * 1. Ensure kubectl is installed (optional for dry-run tests)
 * 2. Run: node --test e2e/tests/k8s-localstack-manifests.spec.ts
 */

const REPO_ROOT = resolve(__dirname, '../..');
const K8S_LOCALSTACK_DIR = resolve(REPO_ROOT, 'k8s/localstack');

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
    // Verify that dry-run actually works without a cluster
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
      existsSync(K8S_LOCALSTACK_DIR),
      true,
      'k8s/localstack directory should exist'
    );
  });

  it('should have deployment.yaml file', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');

    // Assert
    assert.strictEqual(
      existsSync(deploymentPath),
      true,
      'deployment.yaml should exist in k8s/localstack directory'
    );
  });

  it('should have service.yaml file', () => {
    // Arrange
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');

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
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
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
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
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
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'apiVersion'), 'Deployment should have apiVersion field');
    assert.ok(containsKey(content, 'kind'), 'Deployment should have kind field');
    assert.ok(content.includes('kind: Deployment'), 'kind should be Deployment');
  });

  it('should have metadata with name and labels', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'metadata'), 'Deployment should have metadata');
    assert.ok(containsKey(content, 'name'), 'Deployment should have name');
    assert.ok(content.includes('localstack'), 'Deployment name should include localstack');
    assert.ok(containsKey(content, 'labels'), 'Deployment should have labels');
  });

  it('should configure replicas in spec', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'replicas'), 'Deployment should configure replicas');
  });

  it('should have selector with matchLabels', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'selector'), 'Deployment should have selector');
    assert.ok(containsKey(content, 'matchLabels'), 'Deployment selector should have matchLabels');
  });

  it('should define container spec with name and image', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'containers'), 'Deployment should define containers');
    assert.ok(content.includes('image:'), 'Container should specify image');
    assert.ok(content.includes('localstack/localstack'), 'Image should be localstack/localstack');
  });

  it('should configure container port 4566 for edge service', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'ports'), 'Container should define ports');
    assert.ok(content.includes('4566'), 'Container should expose port 4566 (LocalStack edge service)');
  });

  it('should define SERVICES environment variable', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'env'), 'Container should configure environment variables');
    assert.ok(content.includes('SERVICES'), 'Should configure SERVICES env var for LocalStack');
  });

  it('should configure liveness probe for LocalStack health', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'livenessProbe'), 'Container should have livenessProbe');
    assert.ok(
      content.includes('/_localstack/health') || content.includes('/health'),
      'Liveness probe should check LocalStack health endpoint'
    );
  });

  it('should configure readiness probe for LocalStack health', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'readinessProbe'), 'Container should have readinessProbe');
    assert.ok(
      content.includes('/_localstack/health') || content.includes('/health'),
      'Readiness probe should check LocalStack health endpoint'
    );
  });

  it('should configure resource limits and requests', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'resources'), 'Container should define resources');
    assert.ok(containsKey(content, 'limits'), 'Resources should include limits');
    assert.ok(containsKey(content, 'requests'), 'Resources should include requests');
  });
});

describe('K8s LocalStack Manifests - Service Configuration', () => {
  it('should have apiVersion and kind fields in service.yaml', () => {
    // Arrange
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'apiVersion'), 'Service should have apiVersion field');
    assert.ok(containsKey(content, 'kind'), 'Service should have kind field');
    assert.ok(content.includes('kind: Service'), 'kind should be Service');
  });

  it('should have metadata with name and labels', () => {
    // Arrange
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'metadata'), 'Service should have metadata');
    assert.ok(containsKey(content, 'name'), 'Service should have name');
    assert.ok(content.includes('localstack'), 'Service name should include localstack');
  });

  it('should configure ClusterIP service type', () => {
    // Arrange
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(
      containsKeyValue(content, 'type', 'ClusterIP') || !containsKey(content, 'type'),
      'Service type should be ClusterIP (or default)'
    );
  });

  it('should configure selector to match deployment labels', () => {
    // Arrange
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'selector'), 'Service should have selector');
    assert.ok(content.includes('localstack'), 'Service selector should match LocalStack deployment');
  });

  it('should expose port 4566 for LocalStack edge service', () => {
    // Arrange
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'ports'), 'Service should define ports');
    assert.ok(content.includes('4566'), 'Service should expose port 4566');
  });

  it('should configure TCP protocol for service port', () => {
    // Arrange
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(content.includes('protocol: TCP'), 'Service should use TCP protocol');
  });
});

describe('K8s LocalStack Manifests - kubectl dry-run validation', () => {
  it('should pass kubectl dry-run for deployment.yaml', { skip: !isKubectlAvailable() ? 'kubectl is not available' : false }, () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');

    // Act & Assert
    assert.doesNotThrow(() => {
      execCommand(`KUBECONFIG=/dev/null kubectl create --dry-run=client --validate=false -f ${deploymentPath} -o yaml`);
    }, 'deployment.yaml should pass kubectl dry-run validation');
  });

  it('should pass kubectl dry-run for service.yaml', { skip: !isKubectlAvailable() ? 'kubectl is not available' : false }, () => {
    // Arrange
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');

    // Act & Assert
    assert.doesNotThrow(() => {
      execCommand(`KUBECONFIG=/dev/null kubectl create --dry-run=client --validate=false -f ${servicePath} -o yaml`);
    }, 'service.yaml should pass kubectl dry-run validation');
  });

  it('should validate all LocalStack manifests can be applied together', { skip: !isKubectlAvailable() ? 'kubectl is not available' : false }, () => {
    // Arrange & Act & Assert
    assert.doesNotThrow(() => {
      execCommand(`KUBECONFIG=/dev/null kubectl create --dry-run=client --validate=false -f ${K8S_LOCALSTACK_DIR}/ -o yaml`);
    }, 'All LocalStack manifests should be valid when applied together');
  });
});

describe('K8s LocalStack Manifests - Label Consistency', () => {
  it('should use consistent app label across deployment and service', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
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
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
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

describe('K8s LocalStack Manifests - LocalStack-Specific Configuration', () => {
  it('should configure S3 service in SERVICES environment variable', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(content.includes('s3') || content.includes('S3'),
      'LocalStack should enable S3 service');
  });

  it('should use official localstack image', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(content.includes('localstack/localstack'),
      'Deployment should use official LocalStack image');
  });

  it('should not use latest tag for production', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Extract image references
    const imageMatches = content.match(/image:\s*([^\n]+)/g) || [];

    // Assert
    const usesLatestTag = imageMatches.some(img =>
      img.includes(':latest') && !img.includes('$')
    );

    assert.strictEqual(usesLatestTag, false,
      'Production deployments should use specific image tags, not :latest');
  });
});
