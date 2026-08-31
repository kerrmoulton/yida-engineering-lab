import path from 'node:path';
import { defineConfig } from '@playwright/test';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
export default defineConfig({
  testDir: path.join(import.meta.dirname, 'web/e2e'),
  outputDir: path.join(repositoryRoot, '.cache/playwright/performance-v2/results'),
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4337', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npm run start:performance:v2:api',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:4338/api/performance/v2/health',
      reuseExistingServer: true,
    },
    {
      command: 'npm run dev:performance:v2:web',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:4337',
      reuseExistingServer: true,
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
