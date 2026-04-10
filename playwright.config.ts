import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  workers: 2,
  use: {
    baseURL: 'http://localhost:4400',
    headless: true,
  },
  webServer: undefined, // server already running via PM2
});
