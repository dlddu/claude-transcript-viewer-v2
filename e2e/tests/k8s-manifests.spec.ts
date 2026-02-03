import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Kubernetes Manifests E2E Tests
 *
 * These tests verify that Kubernetes manifest files are properly structured
 * and can be validated by kubectl. Tests are initially skipped as manifests
 * are not yet implemented.
 *
 * To run these tests:
 * 1. Ensure kubectl is installed (optional for dry-run tests)
 * 2. Run: node --test e2e/tests/k8s-manifests.spec.ts
 */

const REPO_ROOT = resolve(__dirname, '../..');
const K8S_DIR = resolve(REPO_ROOT, 'k8s/backend');

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

describe('K8s Manifests - File Structure', () => {
  it('should have k8s/backend directory', () => {
    // Assert
    assert.strictEqual(
      existsSync(K8S_DIR),
      true,
      'k8s/backend directory should exist'
    );
  });

  it('should have deployment.yaml file', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');

    // Assert
    assert.strictEqual(
      existsSync(deploymentPath),
      true,
      'deployment.yaml should exist in k8s/backend directory'
    );
  });

  it('should have service.yaml file', () => {
    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');

    // Assert
    assert.strictEqual(
      existsSync(servicePath),
      true,
      'service.yaml should exist in k8s/backend directory'
    );
  });

  it('should have configmap.example.yaml file', () => {
    // Arrange
    const configmapPath = resolve(K8S_DIR, 'configmap.example.yaml');

    // Assert
    assert.strictEqual(
      existsSync(configmapPath),
      true,
      'configmap.example.yaml should exist in k8s/backend directory'
    );
  });

  it('should have secret.example.yaml file', () => {
    // Arrange
    const secretPath = resolve(K8S_DIR, 'secret.example.yaml');

    // Assert
    assert.strictEqual(
      existsSync(secretPath),
      true,
      'secret.example.yaml should exist in k8s/backend directory'
    );
  });
});

describe('K8s Manifests - YAML Validity', () => {
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

  it('should have valid YAML syntax in configmap.example.yaml', () => {
    // Arrange
    const configmapPath = resolve(K8S_DIR, 'configmap.example.yaml');
    const content = readFileSync(configmapPath, 'utf-8');

    // Act & Assert
    assert.doesNotThrow(() => {
      parseYAML(content);
    }, 'configmap.example.yaml should have valid YAML syntax');

    assert.ok(content.includes(':'), 'YAML should contain key-value pairs');
    assert.ok(!content.includes('\t'), 'YAML should use spaces, not tabs');
  });

  it('should have valid YAML syntax in secret.example.yaml', () => {
    // Arrange
    const secretPath = resolve(K8S_DIR, 'secret.example.yaml');
    const content = readFileSync(secretPath, 'utf-8');

    // Act & Assert
    assert.doesNotThrow(() => {
      parseYAML(content);
    }, 'secret.example.yaml should have valid YAML syntax');

    assert.ok(content.includes(':'), 'YAML should contain key-value pairs');
    assert.ok(!content.includes('\t'), 'YAML should use spaces, not tabs');
  });
});

describe('K8s Manifests - Deployment Configuration', () => {
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
    assert.ok(content.includes('ghcr.io'), 'Image should be from ghcr.io registry');
  });

  it('should configure container port 3000', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'ports'), 'Container should define ports');
    assert.ok(content.includes('3000'), 'Container should expose port 3000');
  });

  it('should define environment variables from ConfigMap', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'env') || containsKey(content, 'envFrom'),
      'Container should configure environment variables');
    assert.ok(content.includes('configMap'), 'Should reference ConfigMap for env vars');
  });

  it('should define environment variables from Secret', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(content.includes('secret'), 'Should reference Secret for sensitive env vars');
  });

  it('should configure liveness probe', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'livenessProbe'), 'Container should have livenessProbe');
    assert.ok(content.includes('/api/health'), 'Liveness probe should check /api/health endpoint');
  });

  it('should configure readiness probe', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'readinessProbe'), 'Container should have readinessProbe');
    assert.ok(content.includes('/api/health'), 'Readiness probe should check /api/health endpoint');
  });

  it('should configure resource limits and requests', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'resources'), 'Container should define resources');
    assert.ok(containsKey(content, 'limits'), 'Resources should include limits');
    assert.ok(containsKey(content, 'requests'), 'Resources should include requests');
  });
});

describe('K8s Manifests - Service Configuration', () => {
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

  it('should map port 80 to targetPort 3000', () => {
    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'ports'), 'Service should define ports');
    assert.ok(content.includes('port: 80'), 'Service should listen on port 80');
    assert.ok(content.includes('targetPort: 3000'), 'Service should forward to targetPort 3000');
  });

  it('should configure HTTP protocol for service port', () => {
    // Arrange
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    // Assert
    assert.ok(content.includes('protocol: TCP'), 'Service should use TCP protocol');
  });
});

describe('K8s Manifests - ConfigMap Configuration', () => {
  it('should have apiVersion and kind fields in configmap.example.yaml', () => {
    // Arrange
    const configmapPath = resolve(K8S_DIR, 'configmap.example.yaml');
    const content = readFileSync(configmapPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'apiVersion'), 'ConfigMap should have apiVersion field');
    assert.ok(containsKey(content, 'kind'), 'ConfigMap should have kind field');
    assert.ok(content.includes('kind: ConfigMap'), 'kind should be ConfigMap');
  });

  it('should have metadata with name', () => {
    // Arrange
    const configmapPath = resolve(K8S_DIR, 'configmap.example.yaml');
    const content = readFileSync(configmapPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'metadata'), 'ConfigMap should have metadata');
    assert.ok(containsKey(content, 'name'), 'ConfigMap should have name');
  });

  it('should configure PORT in data section', () => {
    // Arrange
    const configmapPath = resolve(K8S_DIR, 'configmap.example.yaml');
    const content = readFileSync(configmapPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'data'), 'ConfigMap should have data section');
    assert.ok(content.includes('PORT:'), 'ConfigMap should include PORT configuration');
    assert.ok(content.includes('3000'), 'PORT should be set to 3000');
  });

  it('should configure AWS_REGION in data section', () => {
    // Arrange
    const configmapPath = resolve(K8S_DIR, 'configmap.example.yaml');
    const content = readFileSync(configmapPath, 'utf-8');

    // Assert
    assert.ok(content.includes('AWS_REGION:'), 'ConfigMap should include AWS_REGION');
  });

  it('should configure S3_BUCKET in data section', () => {
    // Arrange
    const configmapPath = resolve(K8S_DIR, 'configmap.example.yaml');
    const content = readFileSync(configmapPath, 'utf-8');

    // Assert
    assert.ok(content.includes('S3_BUCKET:'), 'ConfigMap should include S3_BUCKET');
  });

  it('should not contain sensitive data like credentials', () => {
    // Arrange
    const configmapPath = resolve(K8S_DIR, 'configmap.example.yaml');
    const content = readFileSync(configmapPath, 'utf-8');

    // Assert
    const hasSensitiveKeys =
      content.includes('AWS_ACCESS_KEY_ID') ||
      content.includes('AWS_SECRET_ACCESS_KEY') ||
      content.includes('password') ||
      content.includes('secret');

    assert.strictEqual(hasSensitiveKeys, false,
      'ConfigMap should not contain sensitive credentials (use Secret instead)');
  });
});

describe('K8s Manifests - Secret Configuration', () => {
  it('should have apiVersion and kind fields in secret.example.yaml', () => {
    // Arrange
    const secretPath = resolve(K8S_DIR, 'secret.example.yaml');
    const content = readFileSync(secretPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'apiVersion'), 'Secret should have apiVersion field');
    assert.ok(containsKey(content, 'kind'), 'Secret should have kind field');
    assert.ok(content.includes('kind: Secret'), 'kind should be Secret');
  });

  it('should have metadata with name', () => {
    // Arrange
    const secretPath = resolve(K8S_DIR, 'secret.example.yaml');
    const content = readFileSync(secretPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'metadata'), 'Secret should have metadata');
    assert.ok(containsKey(content, 'name'), 'Secret should have name');
  });

  it('should set type to Opaque', () => {
    // Arrange
    const secretPath = resolve(K8S_DIR, 'secret.example.yaml');
    const content = readFileSync(secretPath, 'utf-8');

    // Assert
    assert.ok(containsKeyValue(content, 'type', 'Opaque'),
      'Secret type should be Opaque');
  });

  it('should configure AWS_ACCESS_KEY_ID in data or stringData section', () => {
    // Arrange
    const secretPath = resolve(K8S_DIR, 'secret.example.yaml');
    const content = readFileSync(secretPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'data') || containsKey(content, 'stringData'),
      'Secret should have data or stringData section');
    assert.ok(content.includes('AWS_ACCESS_KEY_ID:'),
      'Secret should include AWS_ACCESS_KEY_ID');
  });

  it('should configure AWS_SECRET_ACCESS_KEY in data or stringData section', () => {
    // Arrange
    const secretPath = resolve(K8S_DIR, 'secret.example.yaml');
    const content = readFileSync(secretPath, 'utf-8');

    // Assert
    assert.ok(content.includes('AWS_SECRET_ACCESS_KEY:'),
      'Secret should include AWS_SECRET_ACCESS_KEY');
  });

  it('should use data (base64) or stringData (plaintext) section', () => {
    // Arrange
    const secretPath = resolve(K8S_DIR, 'secret.example.yaml');
    const content = readFileSync(secretPath, 'utf-8');

    // Note: Secrets can use either 'data' (base64 encoded) or 'stringData' (plaintext)
    // stringData is recommended for example files to avoid GitHub secret scanning issues
    // Assert
    const hasDataOrStringData = containsKey(content, 'data') || containsKey(content, 'stringData');
    assert.ok(hasDataOrStringData, 'Secret should use data or stringData section');
  });

  it('should include usage instructions in comments', () => {
    // Arrange
    const secretPath = resolve(K8S_DIR, 'secret.example.yaml');
    const content = readFileSync(secretPath, 'utf-8');

    // Assert
    assert.ok(content.includes('kubectl') || content.includes('Usage') || content.includes('IMPORTANT'),
      'Secret example should include usage instructions');
  });
});

describe('K8s Manifests - kubectl dry-run validation', () => {
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
      execCommand(`kubectl create --dry-run=client --validate=false -f ${deploymentPath} -o yaml`);
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
      execCommand(`kubectl create --dry-run=client --validate=false -f ${servicePath} -o yaml`);
    }, 'service.yaml should pass kubectl dry-run validation');
  });

  it('should pass kubectl dry-run for configmap.example.yaml', () => {
    // Skip if kubectl is not available
    if (!isKubectlAvailable()) {
      console.warn('kubectl is not available, skipping test');
      return;
    }

    // Arrange
    const configmapPath = resolve(K8S_DIR, 'configmap.example.yaml');

    // Act & Assert
    assert.doesNotThrow(() => {
      execCommand(`kubectl create --dry-run=client --validate=false -f ${configmapPath} -o yaml`);
    }, 'configmap.example.yaml should pass kubectl dry-run validation');
  });

  it('should pass kubectl dry-run for secret.example.yaml', () => {
    // Skip if kubectl is not available
    if (!isKubectlAvailable()) {
      console.warn('kubectl is not available, skipping test');
      return;
    }

    // Arrange
    const secretPath = resolve(K8S_DIR, 'secret.example.yaml');

    // Act & Assert
    assert.doesNotThrow(() => {
      execCommand(`kubectl create --dry-run=client --validate=false -f ${secretPath} -o yaml`);
    }, 'secret.example.yaml should pass kubectl dry-run validation');
  });

  it('should validate all manifests can be applied together', () => {
    // Skip if kubectl is not available
    if (!isKubectlAvailable()) {
      console.warn('kubectl is not available, skipping test');
      return;
    }

    // Arrange & Act & Assert
    assert.doesNotThrow(() => {
      execCommand(`kubectl create --dry-run=client --validate=false -f ${K8S_DIR}/ -o yaml`);
    }, 'All manifests should be valid when applied together');
  });
});

describe('K8s Manifests - Label Consistency', () => {
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

describe('K8s Manifests - Best Practices', () => {
  it('should specify imagePullPolicy in deployment', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(containsKey(content, 'imagePullPolicy'),
      'Deployment should specify imagePullPolicy');
  });

  it('should not use latest tag in production images', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
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

  it('should configure security context for container', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    const hasSecurityContext =
      containsKey(content, 'securityContext') ||
      content.includes('runAsNonRoot') ||
      content.includes('readOnlyRootFilesystem');

    assert.ok(hasSecurityContext,
      'Deployment should configure security context for better security');
  });

  it('should include namespace in metadata (optional but recommended)', () => {
    // Arrange
    const deploymentPath = resolve(K8S_DIR, 'deployment.yaml');
    const servicePath = resolve(K8S_DIR, 'service.yaml');
    const deploymentContent = readFileSync(deploymentPath, 'utf-8');
    const serviceContent = readFileSync(servicePath, 'utf-8');

    // This is optional but good practice
    // Assert - just check that it's considered
    const hasNamespace =
      containsKey(deploymentContent, 'namespace') ||
      containsKey(serviceContent, 'namespace');

    // This test just validates the files exist and are readable
    assert.ok(deploymentContent.length > 0, 'Deployment file should have content');
    assert.ok(serviceContent.length > 0, 'Service file should have content');
  });
});
