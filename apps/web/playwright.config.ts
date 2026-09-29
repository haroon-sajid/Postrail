import { defineConfig, devices } from '@playwright/test';

/** Ports that do not collide with the normal dev servers (8080 / 5173). */
export const E2E_API_ORIGIN = 'http://localhost:8091';
export const E2E_WEB_ORIGIN = 'http://localhost:5174';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: E2E_WEB_ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @postrail/api exec tsx src/test/e2e-server.ts',
      // Health is served at the root.
      url: `${E2E_API_ORIGIN}/`,
      env: { PORT: '8091', DASHBOARD_ORIGIN: E2E_WEB_ORIGIN },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm exec vite --port 5174 --strictPort',
      url: E2E_WEB_ORIGIN,
      env: { VITE_API_ORIGIN: E2E_API_ORIGIN },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
