import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // These specs use the node:test runner (not Playwright) and run via
  // `pnpm tsx --test <file>` in dedicated CI jobs (docker-e2e-tests,
  // k8s-manifest-validation). Ignore them here so `playwright test` never
  // tries to load them.
  testIgnore: [
    '**/docker-build.*',
    '**/k8s-manifests.*',
    '**/kind-localstack-environment.*',
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: 'cd ../frontend && pnpm dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
      },
});
