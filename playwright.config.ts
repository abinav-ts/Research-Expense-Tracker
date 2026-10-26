import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the production build (the service worker only exists there), served by `vite preview`
// with a local D1 database. Run with: npm run test:e2e
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.test.ts',
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // iPhone photos are HEIC, which only WebKit (the engine of Safari on iOS) can open: test that path on WebKit.
    // `npm run test:e2e:safari` runs the whole suite on WebKit.
    { name: 'webkit', testMatch: process.env.ALL_WEBKIT ? '**/*.test.ts' : '**/heic.smoke.test.ts', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run db:local && npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
