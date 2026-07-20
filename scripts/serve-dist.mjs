// Minimal static server for dist/, used by the Playwright E2E suite.
//
// It deliberately does NOT use `vite preview`: an editor extension attached to
// the Vite process (Console Ninja) injects a large instrumentation script into
// the served index.html -- 71 KB served vs 1 KB built -- which both pollutes the
// page under test and trips the strict CSP with a ws://127.0.0.1 connection.
// The E2E suite must exercise the real build, byte for byte, so this serves the
// files straight from disk with nothing in between. It also matches how the app
// is actually hosted in production: plain static files.
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const port = Number(process.env["PORT"] ?? 4173);

// Correct types matter: a wrong Content-Type on .wasm or .mjs breaks module
// workers and WebAssembly streaming instantiation.
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const candidate = resolve(join(root, normalize(clean)));
  // Path traversal guard: never serve outside dist/.
  if (
    candidate !== root &&
    !candidate.startsWith(root + "\\") &&
    !candidate.startsWith(root + "/")
  ) {
    return null;
  }
  try {
    const info = await stat(candidate);
    if (info.isDirectory()) return join(candidate, "index.html");
    return candidate;
  } catch {
    return null;
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const file = (await resolveFile(req.url ?? "/")) ?? join(root, "index.html");
    try {
      await stat(file);
    } catch {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      // The service worker must never be served stale during a test run.
      "Cache-Control": "no-cache",
    });
    createReadStream(file).pipe(res);
  })();
});

server.listen(port, () => {
  console.log(`serving dist/ on http://localhost:${String(port)}`);
});
