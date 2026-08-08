// Shared by every API route that touches the real machine (Terminal: arbitrary shell commands;
// Files: real filesystem writes, sandboxed to `.desktop/` but still real). These routes were built
// on the assumption that `next dev`/`next start` only ever binds to localhost — true for personal
// use, but Veasna OS is open source now, and someone could reasonably run `next start -H 0.0.0.0`,
// port-forward it, or put it behind a tunnel (ngrok, Cloudflare Tunnel, etc.) without realizing what
// that exposes. This is a best-effort guard against ACCIDENTAL exposure, not a hard security
// boundary — see the caveat below. The real protection is: don't expose this server beyond your own
// machine in the first place.
export function isLocalRequest(req: Request): boolean {
  // Confirmed empirically (a debug route dumping raw headers), not assumed: Next.js's own dev *and*
  // presumably production server always sets `x-forwarded-for` itself, to the real connecting peer's
  // address, whenever the client doesn't supply one — a plain direct `curl localhost:3000` arrives
  // with `x-forwarded-for: ::1` despite curl never sending that header at all. So its mere presence
  // means nothing (an earlier version of this check treated presence itself as a red flag and ended
  // up rejecting completely legitimate local requests) — what matters is the *value*.
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Leftmost entry is the original client in a standard proxy chain.
    const first = forwardedFor.split(",")[0].trim();
    return first === "127.0.0.1" || first === "::1" || first === "::ffff:127.0.0.1";
  }
  // No x-forwarded-for at all (some deployment configs may not set it) — fall back to Host header.
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "";
}

/** Caveat, worth stating plainly rather than implying more safety than this actually provides:
 *  `x-forwarded-for` (and the `Host` fallback) are just request headers — confirmed empirically that
 *  Next.js's dev server does NOT overwrite a client-supplied `x-forwarded-for`, it only fills one in
 *  when the client didn't send one. So a request sent directly to a publicly-bound server (no proxy
 *  in between) can still forge `X-Forwarded-For: 127.0.0.1` itself, and this check would not catch
 *  that — the Node.js App Router `Request` object doesn't expose the underlying TCP remote address to
 *  distinguish "really came from this machine" from "just claims to." This guard stops the common
 *  ACCIDENTAL-exposure cases (a real reverse proxy/tunnel in front, which sets this header to the
 *  genuine original client's address, not something the end visitor controls); it is not a substitute
 *  for simply never binding this server to a public interface. */
export function localOnlyResponse() {
  return Response.json(
    {
      error:
        "This endpoint only accepts requests from localhost. It runs real commands and touches the real filesystem on this machine — it is not safe to expose beyond your own computer.",
      code: "local-only",
    },
    { status: 403 }
  );
}
