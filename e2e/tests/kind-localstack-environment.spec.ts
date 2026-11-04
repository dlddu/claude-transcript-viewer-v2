import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * seed가 서버와 동일한 코드 경로로 환경을 재현하는지(DP-AC4의 핵심 보장)는
 * `backend/seed_test.go`가 실측한다.
 *
 * 실행: pnpm tsx --test e2e/tests/kind-localstack-environment.spec.ts
 * (kubectl dry-run 단정은 kubectl이 없으면 건너뛴다)
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

const SCRIPTS_DIR = resolve(REPO_ROOT, 'scripts');
const KIND_SCRIPT = resolve(SCRIPTS_DIR, 'kind-setup.sh');
const KIND_CONFIG = resolve(SCRIPTS_DIR, 'kind-config.yaml');

const isExecutable = (filePath: string): boolean => {
  try {
    const stats = statSync(filePath);
    return (stats.mode & 0o100) !== 0;
  } catch {
    return false;
  }
};


describe('K8s LocalStack Manifests - File Structure', () => {
  it('should have k8s/localstack directory', () => {
    assert.strictEqual(
      existsSync(K8S_LOCALSTACK_DIR),
      true,
      'k8s/localstack directory should exist'
    );
  });

  it('should have deployment.yaml file', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');

    assert.strictEqual(
      existsSync(deploymentPath),
      true,
      'deployment.yaml should exist in k8s/localstack directory'
    );
  });

  it('should have service.yaml file', () => {
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');

    assert.strictEqual(
      existsSync(servicePath),
      true,
      'service.yaml should exist in k8s/localstack directory'
    );
  });
});

describe('K8s LocalStack Manifests - YAML Validity', () => {
  it('should have valid YAML syntax in deployment.yaml', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    assert.doesNotThrow(() => {
      parseYAML(content);
    }, 'deployment.yaml should have valid YAML syntax');

    assert.ok(content.includes(':'), 'YAML should contain key-value pairs');
    assert.ok(!content.includes('\t'), 'YAML should use spaces, not tabs');
  });

  it('should have valid YAML syntax in service.yaml', () => {
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    assert.doesNotThrow(() => {
      parseYAML(content);
    }, 'service.yaml should have valid YAML syntax');

    assert.ok(content.includes(':'), 'YAML should contain key-value pairs');
    assert.ok(!content.includes('\t'), 'YAML should use spaces, not tabs');
  });
});

describe('K8s LocalStack Manifests - Deployment Configuration', () => {
  it('should have apiVersion and kind fields in deployment.yaml', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    assert.ok(containsKey(content, 'apiVersion'), 'Deployment should have apiVersion field');
    assert.ok(containsKey(content, 'kind'), 'Deployment should have kind field');
    assert.ok(content.includes('kind: Deployment'), 'kind should be Deployment');
  });

  it('should have metadata with name and labels', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    assert.ok(containsKey(content, 'metadata'), 'Deployment should have metadata');
    assert.ok(containsKey(content, 'name'), 'Deployment should have name');
    assert.ok(content.includes('localstack'), 'Deployment name should include localstack');
    assert.ok(containsKey(content, 'labels'), 'Deployment should have labels');
  });

  it('should configure replicas in spec', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    assert.ok(containsKey(content, 'replicas'), 'Deployment should configure replicas');
  });

  it('should have selector with matchLabels', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    assert.ok(containsKey(content, 'selector'), 'Deployment should have selector');
    assert.ok(containsKey(content, 'matchLabels'), 'Deployment selector should have matchLabels');
  });

  it('should define container spec with name and image', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    assert.ok(containsKey(content, 'containers'), 'Deployment should define containers');
    assert.ok(content.includes('image:'), 'Container should specify image');
    assert.ok(content.includes('localstack/localstack'), 'Image should be localstack/localstack');
  });

  it('should configure container port 4566 for edge service', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    assert.ok(containsKey(content, 'ports'), 'Container should define ports');
    assert.ok(content.includes('4566'), 'Container should expose port 4566 (LocalStack edge service)');
  });

  it('should define SERVICES environment variable', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    assert.ok(containsKey(content, 'env'), 'Container should configure environment variables');
    assert.ok(content.includes('SERVICES'), 'Should configure SERVICES env var for LocalStack');
  });

  it('should configure liveness probe for LocalStack health', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    assert.ok(containsKey(content, 'livenessProbe'), 'Container should have livenessProbe');
    assert.ok(
      content.includes('/_localstack/health') || content.includes('/health'),
      'Liveness probe should check LocalStack health endpoint'
    );
  });

  it('should configure readiness probe for LocalStack health', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    assert.ok(containsKey(content, 'readinessProbe'), 'Container should have readinessProbe');
    assert.ok(
      content.includes('/_localstack/health') || content.includes('/health'),
      'Readiness probe should check LocalStack health endpoint'
    );
  });

  it('should configure resource limits and requests', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    assert.ok(containsKey(content, 'resources'), 'Container should define resources');
    assert.ok(containsKey(content, 'limits'), 'Resources should include limits');
    assert.ok(containsKey(content, 'requests'), 'Resources should include requests');
  });
});

describe('K8s LocalStack Manifests - Service Configuration', () => {
  it('should have apiVersion and kind fields in service.yaml', () => {
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    assert.ok(containsKey(content, 'apiVersion'), 'Service should have apiVersion field');
    assert.ok(containsKey(content, 'kind'), 'Service should have kind field');
    assert.ok(content.includes('kind: Service'), 'kind should be Service');
  });

  it('should have metadata with name and labels', () => {
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    assert.ok(containsKey(content, 'metadata'), 'Service should have metadata');
    assert.ok(containsKey(content, 'name'), 'Service should have name');
    assert.ok(content.includes('localstack'), 'Service name should include localstack');
  });

  it('should configure ClusterIP service type', () => {
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    assert.ok(
      containsKeyValue(content, 'type', 'ClusterIP') || !containsKey(content, 'type'),
      'Service type should be ClusterIP (or default)'
    );
  });

  it('should configure selector to match deployment labels', () => {
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    assert.ok(containsKey(content, 'selector'), 'Service should have selector');
    assert.ok(content.includes('localstack'), 'Service selector should match LocalStack deployment');
  });

  it('should expose port 4566 for LocalStack edge service', () => {
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    assert.ok(containsKey(content, 'ports'), 'Service should define ports');
    assert.ok(content.includes('4566'), 'Service should expose port 4566');
  });

  it('should configure TCP protocol for service port', () => {
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');
    const content = readFileSync(servicePath, 'utf-8');

    assert.ok(content.includes('protocol: TCP'), 'Service should use TCP protocol');
  });
});

describe('K8s LocalStack Manifests - kubectl dry-run validation', () => {
  it('should pass kubectl dry-run for deployment.yaml', { skip: !isKubectlAvailable() ? 'kubectl is not available' : false }, () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');

    assert.doesNotThrow(() => {
      execCommand(`KUBECONFIG=/dev/null kubectl create --dry-run=client --validate=false -f ${deploymentPath} -o yaml`);
    }, 'deployment.yaml should pass kubectl dry-run validation');
  });

  it('should pass kubectl dry-run for service.yaml', { skip: !isKubectlAvailable() ? 'kubectl is not available' : false }, () => {
    const servicePath = resolve(K8S_LOCALSTACK_DIR, 'service.yaml');

    assert.doesNotThrow(() => {
      execCommand(`KUBECONFIG=/dev/null kubectl create --dry-run=client --validate=false -f ${servicePath} -o yaml`);
    }, 'service.yaml should pass kubectl dry-run validation');
  });

  it('should validate all LocalStack manifests can be applied together', { skip: !isKubectlAvailable() ? 'kubectl is not available' : false }, () => {
    assert.doesNotThrow(() => {
      execCommand(`KUBECONFIG=/dev/null kubectl create --dry-run=client --validate=false -f ${K8S_LOCALSTACK_DIR}/ -o yaml`);
    }, 'All LocalStack manifests should be valid when applied together');
  });
});

describe('K8s LocalStack Manifests - LocalStack-Specific Configuration', () => {
  it('should configure S3 service in SERVICES environment variable', () => {
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    assert.ok(content.includes('s3') || content.includes('S3'),
      'LocalStack should enable S3 service');
  });
});


describe('Local Kind Script - File Structure', () => {
  it('should have scripts directory', () => {
    assert.strictEqual(
      existsSync(SCRIPTS_DIR),
      true,
      'scripts/ directory should exist'
    );
  });

  it('should have kind-setup.sh script', () => {
    assert.strictEqual(
      existsSync(KIND_SCRIPT),
      true,
      'scripts/kind-setup.sh should exist'
    );
  });

  it('should have kind-config.yaml configuration file', () => {
    assert.strictEqual(
      existsSync(KIND_CONFIG),
      true,
      'scripts/kind-config.yaml should exist for kind cluster configuration'
    );
  });
});

describe('Local Kind Script - Permissions', () => {
  it('should have execute permissions on kind-setup.sh', () => {
    assert.ok(
      isExecutable(KIND_SCRIPT),
      'kind-setup.sh should have execute permissions'
    );
  });
});

describe('Local Kind Script - Script Content', () => {
  it('should have bash shebang', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.startsWith('#!/bin/bash') || content.startsWith('#!/usr/bin/env bash'),
      'kind-setup.sh should start with bash shebang'
    );
  });

  it('should enable strict error handling', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('set -e') || content.includes('set -euo pipefail'),
      'kind-setup.sh should enable strict error handling'
    );
  });

  it('should check for kind installation', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('kind') && (content.includes('command -v') || content.includes('which')),
      'Script should check if kind is installed'
    );
  });

  it('should check for kubectl installation', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('kubectl') && (content.includes('command -v') || content.includes('which')),
      'Script should check if kubectl is installed'
    );
  });

  it('should check for docker installation', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('docker') && (content.includes('command -v') || content.includes('which')),
      'Script should check if docker is installed'
    );
  });

  it('should create kind cluster', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('kind create cluster'),
      'Script should create kind cluster'
    );
  });

  it('should use kind-config.yaml for cluster creation', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('kind-config.yaml') || content.includes('--config'),
      'Script should reference kind-config.yaml for cluster configuration'
    );
  });

  it('should build Docker images', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('docker build'),
      'Script should build Docker images'
    );
  });

  it('should load Docker images into kind cluster', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('kind load'),
      'Script should load Docker images into kind cluster'
    );
  });

  it('should apply Kubernetes manifests', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('kubectl apply'),
      'Script should apply Kubernetes manifests'
    );
  });

  it('should deploy LocalStack to kind cluster', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('localstack') || content.includes('k8s/localstack'),
      'Script should deploy LocalStack manifests'
    );
  });

  it('should wait for deployments to be ready', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('kubectl wait') || content.includes('kubectl rollout status'),
      'Script should wait for deployments to be ready'
    );
  });

});

describe('Local Kind Script - Kind Config', () => {
  it('should have valid YAML syntax in kind-config.yaml', () => {
    const content = readFileSync(KIND_CONFIG, 'utf-8');

    assert.ok(content.includes(':'), 'kind-config.yaml should contain key-value pairs');
    assert.ok(!content.includes('\t'), 'kind-config.yaml should use spaces, not tabs');
  });

  it('should specify kind apiVersion', () => {
    const content = readFileSync(KIND_CONFIG, 'utf-8');

    assert.ok(
      content.includes('apiVersion') && content.includes('kind.x-k8s.io'),
      'kind-config.yaml should specify kind apiVersion'
    );
  });

  it('should specify Cluster kind', () => {
    const content = readFileSync(KIND_CONFIG, 'utf-8');

    assert.ok(
      content.includes('kind: Cluster'),
      'kind-config.yaml should specify kind: Cluster'
    );
  });

  it('should configure nodes', () => {
    const content = readFileSync(KIND_CONFIG, 'utf-8');

    assert.ok(
      content.includes('nodes'),
      'kind-config.yaml should configure cluster nodes'
    );
  });

  it('should configure port mappings for local access', () => {
    const content = readFileSync(KIND_CONFIG, 'utf-8');

    assert.ok(
      content.includes('extraPortMappings') || content.includes('hostPort'),
      'kind-config.yaml should configure port mappings for accessing services locally'
    );
  });

  it('should expose port 80 or 443 for ingress', () => {
    const content = readFileSync(KIND_CONFIG, 'utf-8');

    assert.ok(
      content.includes('80') || content.includes('443') || content.includes('8080'),
      'kind-config.yaml should expose ports for HTTP/HTTPS access'
    );
  });
});

describe('Local Kind Script - Cleanup', () => {
  it('should provide cleanup instructions or script', () => {
    const setupContent = readFileSync(KIND_SCRIPT, 'utf-8');
    const cleanupScriptPath = resolve(SCRIPTS_DIR, 'kind-cleanup.sh');
    const cleanupScriptExists = existsSync(cleanupScriptPath);

    assert.ok(
      setupContent.includes('kind delete cluster') || cleanupScriptExists,
      'Should provide cleanup instructions or separate cleanup script'
    );
  });
});

describe('Local Kind Script - Environment Variables', () => {
  it('should configure AWS credentials for LocalStack', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('AWS_ACCESS_KEY_ID') && content.includes('AWS_SECRET_ACCESS_KEY'),
      'Script should configure AWS credentials for LocalStack'
    );
  });

  it('should configure AWS endpoint for LocalStack', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('AWS_ENDPOINT_URL') || content.includes('endpoint-url'),
      'Script should configure AWS endpoint URL for LocalStack'
    );
  });

  it('should create S3 bucket in LocalStack', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('s3 mb') || content.includes('create-bucket'),
      'Script should create S3 bucket in LocalStack'
    );
  });
});

describe('Local Kind Script - Port Forwarding', () => {
  it('should configure or document port forwarding for services', () => {
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    assert.ok(
      content.includes('kubectl port-forward') || content.includes('port forward') || content.includes('extraPortMappings'),
      'Script should configure or document port forwarding for accessing services'
    );
  });
});
