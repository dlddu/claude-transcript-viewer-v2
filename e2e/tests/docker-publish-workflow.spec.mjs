import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '../..');
const WORKFLOW_FILE = resolve(REPO_ROOT, '.github/workflows/docker-publish.yml');

const parseYAML = (content) => {
  const lines = content.split('\n');
  const result = {};
  const stack = [{ obj: result, indent: -1 }];

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

const containsKeyValue = (content, key, value) => {
  const regex = new RegExp(`${key}\\s*:\\s*${value}`, 'i');
  return regex.test(content);
};

const containsKey = (content, key) => {
  const regex = new RegExp(`^\\s*${key}\\s*:`, 'm');
  return regex.test(content);
};

describe.skip('Docker Publish Workflow - File Structure', () => {
  it('should have docker-publish.yml workflow file', () => {
    assert.strictEqual(
      existsSync(WORKFLOW_FILE),
      true,
      'Workflow file should exist at .github/workflows/docker-publish.yml'
    );
  });

  it('should be a valid YAML file', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.doesNotThrow(() => {
      parseYAML(content);
    }, 'YAML file should have valid syntax');

    assert.ok(content.includes(':'), 'YAML should contain key-value pairs');
    assert.ok(!content.includes('\t'), 'YAML should use spaces, not tabs');
  });

  it('should have required workflow structure', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(containsKey(content, 'name'), 'Workflow should have a name');
    assert.ok(containsKey(content, 'on'), 'Workflow should have trigger configuration');
    assert.ok(containsKey(content, 'jobs'), 'Workflow should define jobs');
  });
});

describe.skip('Docker Publish Workflow - Trigger Configuration', () => {
  it('should trigger on main branch push', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      content.includes('push:') || content.includes('on: push'),
      'Workflow should trigger on push'
    );
    assert.ok(
      content.includes('branches:') && content.includes('main'),
      'Workflow should trigger on main branch'
    );
  });

  it('should have correct trigger syntax', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');
    const parsed = parseYAML(content);

    assert.ok(parsed.on, 'Should have "on" trigger configuration');

    const triggerSection = content.match(/on:\s*\n([\s\S]*?)(?=\n\w+:|$)/)?.[1] || '';
    assert.ok(
      triggerSection.includes('main'),
      'Trigger should reference main branch'
    );
  });
});

describe.skip('Docker Publish Workflow - Permissions', () => {
  it('should have packages write permission', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      containsKey(content, 'permissions'),
      'Workflow should define permissions'
    );
    assert.ok(
      containsKeyValue(content, 'packages', 'write'),
      'Workflow should have packages: write permission for GHCR'
    );
  });

  it('should have contents read permission', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      containsKeyValue(content, 'contents', 'read'),
      'Workflow should have contents: read permission'
    );
  });
});

describe.skip('Docker Publish Workflow - Multi-Platform Build', () => {
  it('should configure linux/amd64 platform', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      content.includes('linux/amd64'),
      'Workflow should include linux/amd64 platform'
    );
  });

  it('should configure linux/arm64 platform', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      content.includes('linux/arm64'),
      'Workflow should include linux/arm64 platform'
    );
  });

  it('should use docker/setup-buildx-action for multi-platform builds', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      content.includes('docker/setup-buildx-action'),
      'Workflow should use setup-buildx-action for multi-platform support'
    );
  });

  it('should configure platforms in build step', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      containsKey(content, 'platforms') || content.includes('platforms:'),
      'Workflow should have platforms configuration'
    );
  });
});

describe.skip('Docker Publish Workflow - GHCR Registry', () => {
  it('should login to GitHub Container Registry', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      content.includes('docker/login-action') || content.includes('docker login'),
      'Workflow should use docker/login-action'
    );
    assert.ok(
      content.includes('ghcr.io'),
      'Workflow should login to ghcr.io registry'
    );
  });

  it('should use GITHUB_TOKEN for authentication', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      content.includes('GITHUB_TOKEN') || content.includes('github.token'),
      'Workflow should use GITHUB_TOKEN for GHCR authentication'
    );
  });

  it('should set registry to ghcr.io', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      containsKey(content, 'registry') || content.includes('registry:'),
      'Workflow should configure registry'
    );
    assert.ok(
      content.includes('ghcr.io'),
      'Registry should be set to ghcr.io'
    );
  });
});

describe.skip('Docker Publish Workflow - Image Tags', () => {
  it('should tag images with "latest"', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      content.includes('latest'),
      'Workflow should tag images with "latest"'
    );
  });

  it('should tag images with git SHA', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    const hasGitSHA =
      content.includes('github.sha') ||
      content.includes('${{ github.sha }}') ||
      content.includes('${GITHUB_SHA}');

    assert.ok(
      hasGitSHA,
      'Workflow should tag images with git SHA'
    );
  });

  it('should configure tags in metadata or build step', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    const hasTags =
      containsKey(content, 'tags') ||
      content.includes('tags:') ||
      content.includes('docker/metadata-action');

    assert.ok(
      hasTags,
      'Workflow should configure tags using metadata-action or tags field'
    );
  });
});

describe.skip('Docker Publish Workflow - Image Builds', () => {
  it('should build frontend image', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      content.includes('frontend'),
      'Workflow should reference frontend'
    );
  });

  it('should build backend image', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      content.includes('backend'),
      'Workflow should reference backend'
    );
  });

  it('should use docker/build-push-action', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      content.includes('docker/build-push-action'),
      'Workflow should use build-push-action for building and pushing images'
    );
  });

  it('should set context for each image build', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      containsKey(content, 'context') || content.includes('context:'),
      'Workflow should set build context for images'
    );
  });

  it('should push images to registry', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    const hasPush =
      containsKeyValue(content, 'push', 'true') ||
      content.includes('push: true');

    assert.ok(
      hasPush,
      'Workflow should push images to registry (push: true)'
    );
  });

  it('should specify Dockerfile location', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    const hasDockerfile =
      containsKey(content, 'file') ||
      content.includes('file:') ||
      content.includes('Dockerfile');

    assert.ok(
      hasDockerfile,
      'Workflow should specify Dockerfile location'
    );
  });
});

describe.skip('Docker Publish Workflow - Best Practices', () => {
  it('should use specific action versions (not @latest)', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    const usesLatest = /@latest/.test(content);

    assert.strictEqual(
      usesLatest,
      false,
      'Workflow should pin action versions, not use @latest'
    );
  });

  it('should checkout code before building', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      content.includes('actions/checkout'),
      'Workflow should checkout code using actions/checkout'
    );
  });

  it('should extract metadata for Docker tags and labels', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    const hasMetadata =
      content.includes('docker/metadata-action') ||
      content.includes('labels:');

    assert.ok(
      hasMetadata,
      'Workflow should extract metadata for proper tagging and labeling'
    );
  });

  it('should run on ubuntu-latest', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    assert.ok(
      content.includes('ubuntu-latest'),
      'Workflow should run on ubuntu-latest runner'
    );
  });
});

describe.skip('Docker Publish Workflow - Security', () => {
  it('should use repository owner in image names', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    const hasRepoOwner =
      content.includes('github.repository_owner') ||
      content.includes('${{ github.repository_owner }}') ||
      content.includes('github.repository');

    assert.ok(
      hasRepoOwner,
      'Workflow should use repository owner for image naming'
    );
  });

  it('should only trigger on main branch to prevent unauthorized publishes', () => {
    const content = readFileSync(WORKFLOW_FILE, 'utf-8');

    const onPushMatch = content.match(/on:\s*\n\s*push:\s*\n\s*branches:\s*\[([^\]]+)\]/);

    if (onPushMatch) {
      const branches = onPushMatch[1];
      assert.ok(
        branches.includes('main') || branches.includes('master'),
        'Should only allow push from main/master branch'
      );
    } else {
      assert.ok(
        content.includes('branches:') && content.includes('main'),
        'Should specify main branch in triggers'
      );
    }
  });
});
