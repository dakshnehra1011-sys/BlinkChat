import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The real media test opens four Chromium contexts; keep the suite serial so
  // fake camera/audio capture stays deterministic on developer and CI runners.
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'bun run dev:worker',
      url: 'http://localhost:8787/health',
      reuseExistingServer: true,
    },
    {
      command: 'bun run dev:web',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    },
  ],
});
