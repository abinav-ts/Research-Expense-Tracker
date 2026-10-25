import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the production build (the service worker only exists there), served by `vite preview`
// with a local D1 database. Run with: npm run test:e2e
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.test.ts',
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run db:local && npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
