/** Port of studios/universe/app/api/_lib/localOnlyGuard.ts — see that file for the full rationale
 *  and its honest caveats about what this does and doesn't protect against. It lives here as a copy
 *  rather than an import because bp and universe are separate Next.js applications with separate
 *  bundles; there is no cross-studio import path between them short of extracting a shared package,
 *  which isn't worth it for ~20 lines. Universe's copy remains the source of truth — fix bugs there
 *  first, then mirror.
 *
 *  Every VStudio route needs this: they read and write real files, spawn FFmpeg, and stream media
 *  off disk. This is a guard against ACCIDENTAL exposure (someone running `next start -H 0.0.0.0`,
 *  or putting a tunnel in front of the dev server), not a security boundary — a request sent
 *  directly to a publicly-bound server can still forge these headers. The real protection is not
 *  binding this server to a public interface in the first place.
 *
 *  DIVERGES from Universe's copy in one deliberate way: also accepts private/LAN IPv4 addresses
 *  (RFC 1918), not just loopback — so the dev server is reachable from a phone/tablet on the same
 *  WiFi (e.g. testing touch interactions), which loopback-only can never allow. This widens who can
 *  reach these file/FFmpeg-touching APIs to "anyone on the same local network," not just this
 *  machine — an explicit, accepted tradeoff for VStudio specifically, not mirrored back to Universe. */
function isPrivateLanIPv4(ip: string): boolean {
  // Node represents a dual-stack peer address in IPv4-mapped IPv6 notation (`::ffff:192.168.1.18`),
  // which is what `x-forwarded-for` actually carries for a real LAN client — strip that prefix
  // before parsing octets, or every genuine LAN request fails the check below and gets rejected.
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const parts = normalized.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map(Number);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function isLocalRequest(req: Request): boolean {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Next.js fills this in itself with the real peer address when the client doesn't send one, so
    // its presence means nothing — only the value matters. Leftmost entry is the original client.
    const first = forwardedFor.split(",")[0].trim();
    return (
      first === "127.0.0.1" || first === "::1" || first === "::ffff:127.0.0.1" || isPrivateLanIPv4(first)
    );
  }
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host === "" ||
    isPrivateLanIPv4(host)
  );
}

export function localOnlyResponse(): Response {
  return Response.json(
    {
      error:
        "VStudio's file and rendering APIs only accept requests from this machine. If you're seeing this, the server is reachable from somewhere it shouldn't be.",
      code: "local-only",
    },
    { status: 403 }
  );
}

/** Wraps a route handler with the local-only check plus consistent error handling, so no individual
 *  route can forget either. */
export function localRoute<T extends unknown[]>(
  handler: (req: Request, ...rest: T) => Promise<Response>
): (req: Request, ...rest: T) => Promise<Response> {
  return async (req: Request, ...rest: T) => {
    if (!isLocalRequest(req)) return localOnlyResponse();
    try {
      return await handler(req, ...rest);
    } catch (err) {
      const status = typeof err === "object" && err && "status" in err ? Number((err as { status: number }).status) : 500;
      const code = typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : undefined;
      const message = err instanceof Error ? err.message : String(err);
      // Logged server-side as well: a 500 that only ever appears as a toast in the browser is much
      // harder to diagnose than one with a stack trace in the terminal.
      if (status >= 500) console.error("[vstudio] route error:", err);
      return Response.json({ error: message, code }, { status: Number.isFinite(status) ? status : 500 });
    }
  };
}
