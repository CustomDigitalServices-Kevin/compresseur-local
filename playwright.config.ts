import { defineConfig } from "@playwright/test";

// The E2E suite runs against the PRODUCTION build served statically: that is
// the only configuration where the strict CSP, the code-split WASM chunks and
// the service worker all behave like they will in production. `npm run preview`
// serves dist/ on 4173.
export default defineConfig({
  testDir: "./e2e",
  // Compression is CPU-bound and the WASM codecs are memory-hungry; running
  // specs in parallel on one machine makes timings (and OOM risk) unpredictable.
  workers: 1,
  fullyParallel: false,
  retries: process.env["CI"] === undefined ? 0 : 1,
  // Real WASM compression of a multi-page scanned PDF is slow on a cold cache.
  timeout: 180_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: process.env["CI"] === undefined,
    timeout: 120_000,
  },
});
