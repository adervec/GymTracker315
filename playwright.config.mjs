import { defineConfig, devices } from '@playwright/test';

// GymTracker targets Android Chrome / Chromium, so we test in Chromium only.
// A tiny local static server (test/serve.mjs) hosts the single HTML file over
// http://127.0.0.1 so the app loads in a secure context.
const PORT = 4321;

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `node test/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/gym-tracker.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
