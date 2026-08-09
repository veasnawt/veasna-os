import net from "node:net";

/** Binds to port 0 (OS picks any free loopback port), reads back what it picked, then releases it
 *  immediately for the forked Next.js server to bind instead — avoids colliding with a `pnpm dev`
 *  instance the user might also have running on the default port 3000. */
export function pickFreePort(): Promise<number> {
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
