import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  testDir: './web/e2e',
  outputDir: path.join(repositoryRoot, '.cache/playwright/flowboard/results'),
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: path.join(repositoryRoot, '.cache/playwright/flowboard/report'),
        open: 'never',
      },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4317',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run start:flowboard:api',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:4318/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev:flowboard:web',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:4317',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
