import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * kind + LocalStack Reproducible Environment (DP-AC4)
 *
 * DP-AC4 하나가 두 산출물의 계약을 함께 보장한다: 로컬 kind 클러스터를 세우는
 * `scripts/kind-setup.sh` + `scripts/kind-config.yaml`, 그리고 그 클러스터에 S3 에뮬레이션을
 * 올리는 `k8s/localstack/` 매니페스트. 예전에는 두 스펙 파일로 갈려 있었으나 AC 하나가
 * 스펙 하나를 소유하도록 병합했다. 실행 없이 파일의 존재·구조·구성을 정적으로 검증한다.
 *
 * seed가 서버와 동일한 코드 경로로 환경을 재현하는지(DP-AC4의 핵심 보장)는
 * `backend/seed_test.go`가 실측한다. CI 워크플로 YAML 자체를 문자열로 단정하던
 * `kind-cluster-workflow.spec.ts`는 어떤 AC에도 대응하지 않아 삭제됐다.
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

const SCRIPTS_DIR = resolve(REPO_ROOT, 'scripts');
const KIND_SCRIPT = resolve(SCRIPTS_DIR, 'kind-setup.sh');
const KIND_CONFIG = resolve(SCRIPTS_DIR, 'kind-config.yaml');

const isExecutable = (filePath: string): boolean => {
  try {
    const stats = statSync(filePath);
    // Check if file has execute permission for user (0o100)
    return (stats.mode & 0o100) !== 0;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// LocalStack 매니페스트 (k8s/localstack/)
// ---------------------------------------------------------------------------

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

describe('K8s LocalStack Manifests - LocalStack-Specific Configuration', () => {
  it('should configure S3 service in SERVICES environment variable', () => {
    // Arrange
    const deploymentPath = resolve(K8S_LOCALSTACK_DIR, 'deployment.yaml');
    const content = readFileSync(deploymentPath, 'utf-8');

    // Assert
    assert.ok(content.includes('s3') || content.includes('S3'),
      'LocalStack should enable S3 service');
  });
});

// ---------------------------------------------------------------------------
// 로컬 kind 클러스터 스크립트 (scripts/kind-setup.sh, scripts/kind-config.yaml)
// ---------------------------------------------------------------------------

describe('Local Kind Script - File Structure', () => {
  it('should have scripts directory', () => {
    // Assert
    assert.strictEqual(
      existsSync(SCRIPTS_DIR),
      true,
      'scripts/ directory should exist'
    );
  });

  it('should have kind-setup.sh script', () => {
    // Assert
    assert.strictEqual(
      existsSync(KIND_SCRIPT),
      true,
      'scripts/kind-setup.sh should exist'
    );
  });

  it('should have kind-config.yaml configuration file', () => {
    // Assert
    assert.strictEqual(
      existsSync(KIND_CONFIG),
      true,
      'scripts/kind-config.yaml should exist for kind cluster configuration'
    );
  });
});

describe('Local Kind Script - Permissions', () => {
  it('should have execute permissions on kind-setup.sh', () => {
    // Assert
    assert.ok(
      isExecutable(KIND_SCRIPT),
      'kind-setup.sh should have execute permissions'
    );
  });
});

describe('Local Kind Script - Script Content', () => {
  it('should have bash shebang', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.startsWith('#!/bin/bash') || content.startsWith('#!/usr/bin/env bash'),
      'kind-setup.sh should start with bash shebang'
    );
  });

  it('should enable strict error handling', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('set -e') || content.includes('set -euo pipefail'),
      'kind-setup.sh should enable strict error handling'
    );
  });

  it('should check for kind installation', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kind') && (content.includes('command -v') || content.includes('which')),
      'Script should check if kind is installed'
    );
  });

  it('should check for kubectl installation', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kubectl') && (content.includes('command -v') || content.includes('which')),
      'Script should check if kubectl is installed'
    );
  });

  it('should check for docker installation', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('docker') && (content.includes('command -v') || content.includes('which')),
      'Script should check if docker is installed'
    );
  });

  it('should create kind cluster', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kind create cluster'),
      'Script should create kind cluster'
    );
  });

  it('should use kind-config.yaml for cluster creation', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kind-config.yaml') || content.includes('--config'),
      'Script should reference kind-config.yaml for cluster configuration'
    );
  });

  it('should build Docker images', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('docker build'),
      'Script should build Docker images'
    );
  });

  it('should load Docker images into kind cluster', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kind load'),
      'Script should load Docker images into kind cluster'
    );
  });

  it('should apply Kubernetes manifests', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kubectl apply'),
      'Script should apply Kubernetes manifests'
    );
  });

  it('should deploy LocalStack to kind cluster', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('localstack') || content.includes('k8s/localstack'),
      'Script should deploy LocalStack manifests'
    );
  });

  it('should wait for deployments to be ready', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kubectl wait') || content.includes('kubectl rollout status'),
      'Script should wait for deployments to be ready'
    );
  });

});

describe('Local Kind Script - Kind Config', () => {
  it('should have valid YAML syntax in kind-config.yaml', () => {
    // Arrange
    const content = readFileSync(KIND_CONFIG, 'utf-8');

    // Assert
    assert.ok(content.includes(':'), 'kind-config.yaml should contain key-value pairs');
    assert.ok(!content.includes('\t'), 'kind-config.yaml should use spaces, not tabs');
  });

  it('should specify kind apiVersion', () => {
    // Arrange
    const content = readFileSync(KIND_CONFIG, 'utf-8');

    // Assert
    assert.ok(
      content.includes('apiVersion') && content.includes('kind.x-k8s.io'),
      'kind-config.yaml should specify kind apiVersion'
    );
  });

  it('should specify Cluster kind', () => {
    // Arrange
    const content = readFileSync(KIND_CONFIG, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kind: Cluster'),
      'kind-config.yaml should specify kind: Cluster'
    );
  });

  it('should configure nodes', () => {
    // Arrange
    const content = readFileSync(KIND_CONFIG, 'utf-8');

    // Assert
    assert.ok(
      content.includes('nodes'),
      'kind-config.yaml should configure cluster nodes'
    );
  });

  it('should configure port mappings for local access', () => {
    // Arrange
    const content = readFileSync(KIND_CONFIG, 'utf-8');

    // Assert
    assert.ok(
      content.includes('extraPortMappings') || content.includes('hostPort'),
      'kind-config.yaml should configure port mappings for accessing services locally'
    );
  });

  it('should expose port 80 or 443 for ingress', () => {
    // Arrange
    const content = readFileSync(KIND_CONFIG, 'utf-8');

    // Assert
    assert.ok(
      content.includes('80') || content.includes('443') || content.includes('8080'),
      'kind-config.yaml should expose ports for HTTP/HTTPS access'
    );
  });
});

describe('Local Kind Script - Cleanup', () => {
  it('should provide cleanup instructions or script', () => {
    // Arrange
    const setupContent = readFileSync(KIND_SCRIPT, 'utf-8');
    const cleanupScriptPath = resolve(SCRIPTS_DIR, 'kind-cleanup.sh');
    const cleanupScriptExists = existsSync(cleanupScriptPath);

    // Assert
    assert.ok(
      setupContent.includes('kind delete cluster') || cleanupScriptExists,
      'Should provide cleanup instructions or separate cleanup script'
    );
  });
});

describe('Local Kind Script - Environment Variables', () => {
  it('should configure AWS credentials for LocalStack', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('AWS_ACCESS_KEY_ID') && content.includes('AWS_SECRET_ACCESS_KEY'),
      'Script should configure AWS credentials for LocalStack'
    );
  });

  it('should configure AWS endpoint for LocalStack', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('AWS_ENDPOINT_URL') || content.includes('endpoint-url'),
      'Script should configure AWS endpoint URL for LocalStack'
    );
  });

  it('should create S3 bucket in LocalStack', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('s3 mb') || content.includes('create-bucket'),
      'Script should create S3 bucket in LocalStack'
    );
  });
});

describe('Local Kind Script - Port Forwarding', () => {
  it('should configure or document port forwarding for services', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('kubectl port-forward') || content.includes('port forward') || content.includes('extraPortMappings'),
      'Script should configure or document port forwarding for accessing services'
    );
  });
});
