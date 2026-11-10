import { defineConfig, devices } from '@playwright/test';

// GymTracker315 targets Android Chrome / Chromium, so we test in Chromium only.
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
    // One time zone everywhere, so a fixture's "same day" means the same thing on a laptop and on CI.
    // Code that must hold across midnight or time zones pins the clock in its own spec (midnight.spec.mjs).
    timezoneId: 'UTC',
    // The app's default theme follows the device (feat 559); the suite was written against the dark default.
    // A spec that needs light mode emulates it (test/whatsnewtheme.spec.mjs).
    colorScheme: 'dark',
  },
  // GymTracker315 is built for Android Chrome, so we test both a desktop Chromium
  // viewport and an emulated Pixel (mobile UA, touch, small viewport) — the boot
  // + render assertions are the ones that benefit from the mobile profile.
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-pixel', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `node test/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/gym-tracker.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
