import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.FRONTEND_URL || 'http://localhost:5173';
const backendURL = process.env.BACKEND_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html'], ['github']]
    : [['html'], ['list']],

  use: {
    baseURL,
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
    : [
        {
          command: 'pnpm --filter @claude-transcript-viewer/backend dev',
          url: backendURL,
          timeout: 120 * 1000,
          reuseExistingServer: !process.env.CI,
        },
        {
          command: 'pnpm --filter @claude-transcript-viewer/frontend dev',
          url: baseURL,
          timeout: 120 * 1000,
          reuseExistingServer: !process.env.CI,
        },
      ],
});
