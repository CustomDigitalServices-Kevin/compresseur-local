import { defineConfig } from "@playwright/test";

// The E2E suite runs against the PRODUCTION build served statically: that is
// the only configuration where the strict CSP, the code-split WASM chunks and
// the service worker all behave like they will in production.
//
// It serves dist/ with scripts/serve-dist.mjs rather than `vite preview`: an
// editor extension attached to the Vite process injected an instrumentation
// script into the served HTML (71 KB served vs 1 KB built), so the suite was
// not testing the real bundle. See the comment in that script.
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
    command: "npm run serve:dist",
    url: "http://localhost:4173",
    reuseExistingServer: process.env["CI"] === undefined,
    timeout: 120_000,
  },
});
