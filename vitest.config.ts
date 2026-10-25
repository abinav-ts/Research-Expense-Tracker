import { defineConfig } from 'vitest/config';

// Unit and API tests only; Playwright runs tests/e2e separately (npm run test:e2e).
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'] },
});
