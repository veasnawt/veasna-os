import net from "node:net";

function tryListen(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(null));
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const bound = address && typeof address === "object" ? address.port : null;
      server.close(() => resolve(bound));
    });
  });
}

/** Binds to a specific port to check it's free, then releases it immediately for the forked
 *  server to bind instead. Tries `preferredPort` first — the browser origin
 *  (`http://127.0.0.1:PORT`) is what any `localStorage`-backed state would be scoped to, so a
 *  stable port matters even for a single-server app like this one. Falls back to an OS-assigned
 *  free port (port 0) only if the preferred one is genuinely taken. */
export async function pickFreePort(preferredPort?: number): Promise<number> {
  if (preferredPort !== undefined) {
    const bound = await tryListen(preferredPort);
    if (bound !== null) return bound;
  }
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Failed to acquire a free port")));
      }
    });
  });
}
