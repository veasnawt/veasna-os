import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pickFreePort } from "./pickFreePort";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

/** Serves a plain static build directory (Game Dev Studio's Vite `dist/`) over a real local HTTP
 *  server on a free loopback port — no Node server-side framework needed, since the built output
 *  is already fully static. A lightweight in-process http.Server rather than another
 *  utilityProcess.fork'd child: there's no separate module resolution/env isolation to gain here
 *  the way there is for the Next.js servers, so the extra process would just be overhead. */
export async function serveStaticDir(rootDir: string, logLabel: string, preferredPort: number): Promise<{ url: string; stop: () => void }> {
  if (!fs.existsSync(path.join(rootDir, "index.html"))) {
    throw new Error(`No static build found at "${rootDir}" (missing index.html) — did the build:desktop pipeline run?`);
  }

  const server = http.createServer((req, res) => {
    try {
      const requestPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
      // Reject any attempt to escape rootDir (encoded "..", etc.) — this only ever serves a fixed,
      // pre-built local directory, but the same discipline as the sandboxed files API applies.
      const safeRel = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
      let filePath = path.join(rootDir, safeRel);
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      if (!fs.existsSync(filePath)) {
        // SPA-style fallback — any unmatched path resolves to the app shell, matching how Vite's
        // own dev server and `vite preview` both behave for a single-page app.
        filePath = path.join(rootDir, "index.html");
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500).end(`Internal error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  server.on("clientError", () => {}); // Malformed request from the loopback client — ignore, not our problem.
  process.stdout.write(`${logLabel} static server starting...\n`);

  const port = await pickFreePort(preferredPort);
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

  return { url: `http://127.0.0.1:${port}`, stop: () => server.close() };
}
