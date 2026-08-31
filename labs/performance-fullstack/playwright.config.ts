import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
export default defineConfig({
  testDir: './web/e2e',
  outputDir: path.join(repositoryRoot, '.cache/playwright/performance/results'),
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4327', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'npm run start:performance:api',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:4328/api/performance/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev:performance:web',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:4327',
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
