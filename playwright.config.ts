import { defineConfig } from '@playwright/test'

/** End-to-end tests drive the built Electron app. Run with `npm run e2e`. */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
})
