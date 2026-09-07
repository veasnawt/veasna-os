import { checkProjectOwnership, requireSessionUser, VCUT_HOSTED } from "./auth";
import { spendCredits } from "./credits";
import type { SessionUser } from "@veasnawt/auth/server";

/** Port of studios/universe/app/api/_lib/localOnlyGuard.ts — see that file for the full rationale
 *  and its honest caveats about what this does and doesn't protect against. It lives here as a copy
 *  rather than an import because bp and universe are separate Next.js applications with separate
 *  bundles; there is no cross-studio import path between them short of extracting a shared package,
 *  which isn't worth it for ~20 lines. Universe's copy remains the source of truth — fix bugs there
 *  first, then mirror.
 *
 *  Every VCut route needs this: they read and write real files, spawn FFmpeg, and stream media
 *  off disk. This is a guard against ACCIDENTAL exposure (someone running `next start -H 0.0.0.0`,
 *  or putting a tunnel in front of the dev server), not a security boundary — a request sent
 *  directly to a publicly-bound server can still forge these headers. The real protection is not
 *  binding this server to a public interface in the first place.
 *
 *  DIVERGES from Universe's copy in one deliberate way: also accepts private/LAN IPv4 addresses
 *  (RFC 1918), not just loopback — so the dev server is reachable from a phone/tablet on the same
 *  WiFi (e.g. testing touch interactions), which loopback-only can never allow. This widens who can
 *  reach these file/FFmpeg-touching APIs to "anyone on the same local network," not just this
 *  machine — an explicit, accepted tradeoff for VCut specifically, not mirrored back to Universe.
 *
 *  `localRoute` below has a SECOND, entirely different gate behind `VCUT_HOSTED` (see `./auth.ts`)
 *  for the public web deployment — real bearer-token auth instead of an IP check, since "which
 *  machine" stops meaning anything once this same server is meant to be reachable from anywhere.
 *  Desktop's bundled server and local dev never set `VCUT_HOSTED`, so everything below this comment
 *  continues to run for them exactly as it always has. */
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
        "VCut's file and rendering APIs only accept requests from this machine. If you're seeing this, the server is reachable from somewhere it shouldn't be.",
      code: "local-only",
    },
    { status: 403 }
  );
}

function errorResponse(err: unknown): Response {
  // Checked by class, not by an ad-hoc `code`/`status` pair like ApiError below — `spend()` (see
  // `hostedCreditGatedRoute`) always throws exactly this type, so there's no risk of an unrelated
  // error accidentally matching a duck-typed shape and getting mis-reported as a credits problem.
  if (err instanceof InsufficientCreditsError) {
    return Response.json({ error: err.message, code: "insufficient-credits" }, { status: 402 });
  }
  const status = typeof err === "object" && err && "status" in err ? Number((err as { status: number }).status) : 500;
  const code = typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : undefined;
  const message = err instanceof Error ? err.message : String(err);
  // Logged server-side as well: a 500 that only ever appears as a toast in the browser is much
  // harder to diagnose than one with a stack trace in the terminal.
  if (status >= 500) console.error("[vcut] route error:", err);
  return Response.json({ error: message, code }, { status: Number.isFinite(status) ? status : 500 });
}

/** Wraps a route handler with the local-only (or, in hosted mode, real-auth) check plus consistent
 *  error handling, so no individual route can forget either.
 *
 *  In `VCUT_HOSTED` mode: requires a valid bearer session (`requireSessionUser`), and — since almost
 *  every route already reads `?projectId=` from the URL the same way — generically checks the
 *  session's user owns that project when one is present (`checkProjectOwnership`). A request with no
 *  `projectId` at all (the bundled-asset routes like `fonts/[file]`/`sfx/[file]`, or `POST
 *  /api/vcut/project` creating a brand-new one) just needs a valid session; there's nothing to own
 *  yet, or nothing user-owned to protect. This keeps every existing route file unmodified EXCEPT the
 *  few that key off something other than `projectId` (the `jobId`-keyed export/captions/inpaint
 *  routes) or that mutate the ownership index itself (`project/route.ts`'s `POST`/`DELETE`,
 *  `projects/route.ts`'s `GET`) — those have their own explicit `VCUT_HOSTED` handling, not just this
 *  generic gate. */
export function localRoute<T extends unknown[]>(
  handler: (req: Request, ...rest: T) => Promise<Response>
): (req: Request, ...rest: T) => Promise<Response> {
  return async (req: Request, ...rest: T) => {
    if (VCUT_HOSTED) {
      try {
        const user = await requireSessionUser(req);
        const projectId = new URL(req.url).searchParams.get("projectId");
        if (projectId) await checkProjectOwnership(user.id, projectId);
      } catch (err) {
        return errorResponse(err);
      }
    } else if (!isLocalRequest(req)) {
      return localOnlyResponse();
    }
    try {
      return await handler(req, ...rest);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Same shape as `localRoute`, but never requires a session in hosted mode — for the two routes that
 *  serve BUNDLED, allowlisted-filename assets identical for every user (`fonts/[file]` and
 *  `sfx/[file]`): a bundled font/SFX file isn't "nothing user-owned to protect" the way `localRoute`'s
 *  own doc comment first reasoned for a route with no `projectId` — it's not user content AT ALL, so
 *  requiring sign-in to fetch it is stricter than the data warrants, not just unnecessary.
 *
 *  This matters beyond principle: it's the actual fix for a real production bug. These files are
 *  referenced from STATIC `@font-face` CSS rules (studios/vcut/app/globals.css) and plain `<audio
 *  src>` strings — neither can attach an `Authorization` header or a `?token=` fallback the way
 *  `mediaUrl`'s dynamically-built URLs can (see `_lib/auth.ts`'s `requireSessionUser` doc comment for
 *  that fallback, used for genuinely per-user content like thumbnails/exports instead). Gating these
 *  behind auth at all meant every bundled font silently failed to load on the real vcut.io deploy —
 *  confirmed directly, not theoretical. Local mode's IP check still applies underneath, unchanged. */
export function publicAssetRoute<T extends unknown[]>(
  handler: (req: Request, ...rest: T) => Promise<Response>
): (req: Request, ...rest: T) => Promise<Response> {
  return async (req: Request, ...rest: T) => {
    if (!VCUT_HOSTED && !isLocalRequest(req)) return localOnlyResponse();
    try {
      return await handler(req, ...rest);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Same shape as `localRoute`, for a route this app deliberately does NOT offer in the hosted web
 *  deployment — Auto Captions' and Remove Object's shared settings route, and the local ProPainter
 *  inpaint setup, all use this. Why: `_lib/inpaintEnvFile.ts` persists ONE shared API key file for
 *  the whole server process — fine for a local, single-user editor (today's only real deployment),
 *  actively dangerous in hosted multi-tenant mode, where any authenticated user's settings save would
 *  overwrite the key every OTHER tenant's jobs use next. Properly scoping that needs a real per-user
 *  encrypted-credential store, which is separable follow-up work, not something to half-do here.
 *  (The local ProPainter provider specifically is ALSO disabled for a second, independent reason:
 *  unbounded shared-CPU inference per tenant on one machine.) Still runs the normal local-only/hosted
 *  gate underneath in every OTHER mode — this only adds a hosted-specific refusal on top, so desktop
 *  and local dev keep working exactly as they always have. */
export function hostedDisabledRoute<T extends unknown[]>(
  feature: string,
  handler: (req: Request, ...rest: T) => Promise<Response>
): (req: Request, ...rest: T) => Promise<Response> {
  return localRoute(async (req: Request, ...rest: T) => {
    if (VCUT_HOSTED) {
      return Response.json(
        { error: `${feature} isn't available in the hosted web version yet.`, code: "feature-disabled-hosted" },
        { status: 403 }
      );
    }
    return handler(req, ...rest);
  });
}

/** Billing calls are the one class of request in this whole app that's EXPECTED to cross origins for
 *  real: desktop's bundled server runs on its own loopback port, and mobile's Capacitor shell has no
 *  HTTP origin at all — both call OUT to the single live `vcut.io` deployment for these four routes
 *  specifically (see `packages/vcut/src/api/billing.ts`'s own doc comment on why), unlike every other
 *  route here, which a given platform only ever calls on itself (relative paths, always same-origin).
 *  A bearer token in an `Authorization` header (never a cookie) is what actually authenticates these
 *  requests, so a permissive origin is safe here the way it wouldn't be for a cookie-authenticated
 *  endpoint — there's no session to steal via a forged cross-site request when there's no session
 *  cookie to begin with. */
function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return new Response(res.body, { status: res.status, headers });
}

/** The browser's own CORS preflight for a cross-origin `POST`/`GET` carrying an `Authorization`
 *  header — every route under `billing/` re-exports this as its own `OPTIONS`, since Next.js routes
 *  each HTTP method separately and there's no way to attach this to `GET`/`POST` themselves. */
export function corsPreflight(): Response {
  return withCors(new Response(null, { status: 204 }));
}

/** `hostedDisabledRoute`'s mirror image — for a route that only means anything ONCE `VCUT_HOSTED` is
 *  true (the billing routes: `checkout`/`portal`/`webhook`/`status`). A local single-user install has
 *  no concept of a subscription to check, so this refuses with 404 rather than running `localRoute`'s
 *  own IP-based guard at all — there's no "local" version of these to protect. Still requires a real
 *  session via `requireSessionUser` in hosted mode, same as `localRoute` — but deliberately does NOT
 *  run `localRoute`'s generic `?projectId=` ownership check, since none of these four routes are
 *  scoped to a project at all. Every response (success or error) goes through `withCors` — see its own
 *  doc comment for why these four routes specifically need it. */
export function hostedOnlyRoute<T extends unknown[]>(
  handler: (req: Request, user: SessionUser, ...rest: T) => Promise<Response>
): (req: Request, ...rest: T) => Promise<Response> {
  return async (req: Request, ...rest: T) => {
    if (!VCUT_HOSTED) {
      return withCors(Response.json({ error: "Not available outside the hosted web deployment.", code: "hosted-only" }, { status: 404 }));
    }
    try {
      const user = await requireSessionUser(req);
      return withCors(await handler(req, user, ...rest));
    } catch (err) {
      return withCors(errorResponse(err));
    }
  };
}

/** Thrown by the `spend` callback `hostedCreditGatedRoute` hands its handler, when there aren't
 *  enough credits — a distinct error type (not a generic `ApiError`) so `errorResponse` can recognize
 *  it and attach `code: "insufficient-credits"` alongside the 402, which client UI (`AutoCaptionsDialog`,
 *  Inspector's `RemoveObjectSection`) branches on to show an "upgrade to Pro" message specifically. */
export class InsufficientCreditsError extends Error {
  constructor(feature: string) {
    super(`Not enough credits for ${feature} — upgrade to Pro, or wait for your credits to refill.`);
  }
}

/** For a centrally-funded feature (Auto Captions, Remove Object — VCut pays ONE provider account,
 *  not each user their own key) whose POST actually incurs real cost. Same "IP check locally, real
 *  auth hosted" split as `localRoute`. Deliberately does NOT spend credits itself before the handler
 *  runs — a route often has its OWN upfront validation (FFmpeg missing, a referenced clip no longer
 *  existing, an empty time range) that has nothing to do with real usage; spending automatically here
 *  would charge a credit for a request that was always going to be rejected before doing anything.
 *  Instead hands the handler a `spend()` callback to call itself, once ITS OWN validation has passed
 *  and it's about to actually start the real (billable) work — `spend()` throws
 *  `InsufficientCreditsError` when there isn't enough, which the handler can just let propagate (this
 *  wrapper's own try/catch turns it into a clean 402 via `errorResponse`). A no-op that always
 *  succeeds outside hosted mode (nothing to meter locally) — `user` is `null` there too, since there's
 *  nothing to stamp a job's `ownerId` with. No CORS wrapping — unlike billing's four routes, these are
 *  only ever called same-origin (each platform's own client only ever talks to its own bundled/hosted
 *  server), matching `localRoute`'s own lack of CORS handling. */
export function hostedCreditGatedRoute<T extends unknown[]>(
  feature: string,
  cost: number,
  handler: (req: Request, user: SessionUser | null, spend: (amount?: number) => Promise<void>, ...rest: T) => Promise<Response>
): (req: Request, ...rest: T) => Promise<Response> {
  return async (req: Request, ...rest: T) => {
    let user: SessionUser | null = null;
    if (VCUT_HOSTED) {
      try {
        user = await requireSessionUser(req);
      } catch (err) {
        return errorResponse(err);
      }
    } else if (!isLocalRequest(req)) {
      return localOnlyResponse();
    }
    const currentUser = user;
    // `amount` overrides the route's own declared `cost` — for a feature whose real cost scales with
    // something only the handler's own upfront validation knows (Remove Object's own per-5-second-
    // chunk pricing once a clip exceeds `bria/video-erase-object`'s hard cap, for instance). Omitted,
    // this behaves exactly as before.
    async function spend(amount?: number): Promise<void> {
      if (!VCUT_HOSTED || !currentUser) return;
      const spent = await spendCredits(currentUser.id, feature, amount ?? cost);
      if (!spent) throw new InsufficientCreditsError(feature);
    }
    try {
      return await handler(req, user, spend, ...rest);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** The `GET`/`DELETE`/`HEAD` counterpart to `hostedCreditGatedRoute` above — same gate, no spend
 *  (polling progress, cancelling, or checking availability isn't NEW usage; the POST that started the
 *  job already paid for it). Passes `user` through so the route itself can check a job's own
 *  `ownerId` before returning it — these routes key their in-memory jobs by `jobId` alone, with no
 *  generic `?projectId=` for `localRoute`'s own ownership check to key off, so that check has to live
 *  in each route, not here. */
export function hostedSessionRoute<T extends unknown[]>(
  handler: (req: Request, user: SessionUser | null, ...rest: T) => Promise<Response>
): (req: Request, ...rest: T) => Promise<Response> {
  return async (req: Request, ...rest: T) => {
    let user: SessionUser | null = null;
    if (VCUT_HOSTED) {
      try {
        user = await requireSessionUser(req);
      } catch (err) {
        return errorResponse(err);
      }
    } else if (!isLocalRequest(req)) {
      return localOnlyResponse();
    }
    try {
      return await handler(req, user, ...rest);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
