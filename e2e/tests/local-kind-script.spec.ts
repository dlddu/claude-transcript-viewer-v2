import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Local Kind Script E2E Tests
 *
 * These tests verify that local kind cluster setup scripts exist and are properly
 * configured. The tests check file existence, permissions, and basic structure
 * without executing the scripts.
 *
 * To run these tests:
 * Run: node --test e2e/tests/local-kind-script.spec.ts
 */

const REPO_ROOT = resolve(__dirname, '../..');
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
  it('should have execute permissions on kind-setup.sh', { skip: !existsSync(KIND_SCRIPT) ? 'kind-setup.sh does not exist' : false }, () => {
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

  it('should include usage instructions in comments', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('Usage') || content.includes('usage') || content.includes('USAGE'),
      'Script should include usage instructions'
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

describe('Local Kind Script - Documentation', () => {
  it('should include prerequisites in comments', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('Prerequisites') || content.includes('Requirements') || content.includes('PREREQUISITES'),
      'Script should document prerequisites'
    );
  });

  it('should document required tools', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    const hasToolDocs =
      content.includes('kind') &&
      content.includes('kubectl') &&
      content.includes('docker');

    assert.ok(
      hasToolDocs,
      'Script should document required tools (kind, kubectl, docker)'
    );
  });

  it('should include setup steps description', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('echo') || content.includes('Steps') || content.includes('STEP'),
      'Script should describe setup steps'
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

  it('should document how to access frontend application', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('frontend') || content.includes('localhost:') || content.includes('http://'),
      'Script should document how to access frontend application'
    );
  });

  it('should document how to access backend API', () => {
    // Arrange
    const content = readFileSync(KIND_SCRIPT, 'utf-8');

    // Assert
    assert.ok(
      content.includes('backend') || content.includes('api') || content.includes(':3000'),
      'Script should document how to access backend API'
    );
  });
});
