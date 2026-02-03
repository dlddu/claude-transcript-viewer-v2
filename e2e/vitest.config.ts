import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/docker-build.spec.ts'],
    testTimeout: 120000, // 2 minutes for Docker operations
    hookTimeout: 30000,
    globals: true,
  },
});
