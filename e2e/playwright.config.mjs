import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 12_000 },
  forbidOnly: Boolean(process.env.CI),
  workers: 2,
  reporter: 'list',
  retries: 0,
  use: {
    baseURL: process.env.HYDROGRID_BASE_URL ?? 'http://127.0.0.1:8080',
    ...devices['Desktop Chrome'],
    launchOptions: { executablePath: process.env.HYDROGRID_CHROME_PATH },
    trace: 'retain-on-failure',
  },
});
