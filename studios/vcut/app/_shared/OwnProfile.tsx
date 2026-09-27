"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSupabaseSession } from "@veasnawt/auth";
import {
  getBillingStatus,
  openBillingPortal,
  startCheckout,
  type BillingStatus,
} from "@veasnawt/vcut/src/api/billing";
import {
  isDesktopSignInAvailable,
  openDesktopSignIn,
} from "@veasnawt/vcut/src/api/desktopAuth";
import { Settings } from "@veasnawt/vicons";
import { Avatar } from "./Avatar";
import {
  authFetch,
  displayNameOrFallback,
  formatFileSize,
  HOSTED,
  profilePath,
  templatePosterUrl,
  templatePreviewUrl,
  type TemplateRow,
} from "./hostedClient";

/** Same key `packages/vcut/src/store/editorStore.ts` reads/writes for the in-editor language toggle —
 *  reused here directly (not imported — this app's dashboard-level pages deliberately stay independent
 *  of the editor package, see `_shared/hostedClient.ts`'s own doc comment) so a preference set from
 *  either place is picked up by the other next time it loads. */
const LANGUAGE_STORAGE_KEY = "vcut-language";

interface LibraryUsage {
  usedBytes: number;
  capBytes: number;
}

/** Same shape `GET /api/vcut/creators/[id]` already returns for anyone's public page — calling it
 *  against your OWN id (below) gets you the identical stats/grids for free, no separate "my own
 *  profile" endpoint needed. `listPublicTemplatesByOwner` (server-side) only ever returns PUBLISHED
 *  templates even for the owner's own view — this page is meant to show what your profile looks like to
 *  everyone else, not a private drafts list (that's what the Templates tab's own "My Templates" is for). */
interface OwnProfileInfo {
  id: string;
  displayName: string | null;
  username: string | null;
  followerCount: number;
  followingCount: number;
  totalLikes: number;
  templates: TemplateRow[];
  likedTemplates: TemplateRow[];
}

interface UsernameCheck {
  candidate: string;
  checking: boolean;
  valid: boolean;
  available: boolean;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** The "Me" tab — your own profile (mirroring `/u/[id]`'s own layout: avatar, stats, Templates/Liked
 *  grids) PLUS account settings (billing, storage, language, sign out), which absorbed the standalone
 *  `/account` page (still reachable, now just a redirect — see `account/page.tsx`). A real, direct
 *  request: this used to be settings-only with no profile identity beyond a plain display-name field —
 *  now it looks like the same kind of page anyone visiting `/u/<you>` sees, just editable, with a
 *  username you can set for a readable share link. Auth-gating lives in `(tabs)/layout.tsx`, shared
 *  across every tab. */
export default function OwnProfile() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useSupabaseSession();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [usage, setUsage] = useState<LibraryUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "km">("en");

  const [info, setInfo] = useState<OwnProfileInfo | null>(null);
  const [tab, setTab] = useState<"templates" | "liked">("templates");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsHeading = useRef<HTMLHeadingElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const settingsWasOpen = useRef(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<"name" | "username" | null>(
    null,
  );
  const editTrigger = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const usernameInput = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayNameField] = useState("");
  const [savedDisplayName, setSavedDisplayName] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  const [username, setUsernameField] = useState("");
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheck | null>(
    null,
  );
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  useEffect(() => {
    if (!HOSTED || !user || !savedUsername) return;
    const canonical = profilePath(user.id, savedUsername);
    if (pathname === "/me" || pathname.startsWith("/@")) {
      if (pathname !== canonical) router.replace(canonical);
    }
  }, [pathname, savedUsername, user, router]);

  useEffect(() => {
    if (settingsOpen) settingsHeading.current?.focus({ preventScroll: true });
    else if (settingsWasOpen.current)
      settingsTrigger.current?.focus({ preventScroll: true });
    settingsWasOpen.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    if (editTarget) {
      const input =
        editTarget === "name" ? nameInput.current : usernameInput.current;
      input?.focus({ preventScroll: true });
    }
  }, [editTarget]);

  function openProfileEditor(target: "name" | "username") {
    setEditTarget(target);
    (target === "name" ? nameInput.current : usernameInput.current)?.focus({
      preventScroll: true,
    });
  }

  function closeProfileEditor() {
    if (savingName || savingUsername) return;
    editTrigger.current?.focus({ preventScroll: true });
    setEditTarget(null);
    setNameError(null);
    setDisplayNameField(savedDisplayName ?? "");
    setUsernameField(savedUsername ?? "");
    setUsernameCheck(null);
    setUsernameError(null);
  }

  useEffect(() => {
    // Read after mount on purpose: the server render can't see localStorage, so initialising `language`
    // from it directly would hydrate with a mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanguage(
      window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "km" ? "km" : "en",
    );
  }, []);

  // Plan/credits: works everywhere a session exists, not just the hosted deployment — `billing.ts`'s
  // own `billingFetch` always calls the one live vcut.io billing backend directly, the same
  // centrally-funded account infrastructure desktop's AI-generation credits already depend on. Split
  // out from the hosted-only fetches below, which genuinely have no desktop equivalent (see each of
  // their own routes' doc comments: no per-user library/profile storage exists outside vcut.io itself).
  useEffect(() => {
    if (!user) return;
    void getBillingStatus().then(setStatus);
  }, [user]);

  useEffect(() => {
    if (!HOSTED || !user) return;
    authFetch("/api/vcut/media/library")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { usedBytes: number; capBytes: number } | null) => {
        if (body)
          setUsage({ usedBytes: body.usedBytes, capBytes: body.capBytes });
      })
      .catch(() => {});
    authFetch("/api/vcut/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          body: { displayName: string | null; username: string | null } | null,
        ) => {
          if (!body) return;
          setDisplayNameField(body.displayName ?? "");
          setSavedDisplayName(body.displayName);
          setUsernameField(body.username ?? "");
          setSavedUsername(body.username);
        },
      )
      .catch(() => {});
    authFetch(`/api/vcut/creators/${encodeURIComponent(user.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: OwnProfileInfo | null) => {
        if (body) setInfo(body);
      })
      .catch(() => {});
  }, [user]);

  async function saveDisplayName() {
    setSavingName(true);
    setNameError(null);
    try {
      const res = await authFetch("/api/vcut/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { displayName: string | null };
      setDisplayNameField(body.displayName ?? "");
      setSavedDisplayName(body.displayName);
      setInfo((prev) =>
        prev ? { ...prev, displayName: body.displayName } : prev,
      );
    } catch {
      setNameError("Couldn't save your name — try again in a moment.");
    } finally {
      setSavingName(false);
    }
  }

  const trimmedUsername = username.trim().toLowerCase();
  const usernameChanged =
    trimmedUsername !== (savedUsername ?? "") && trimmedUsername.length > 0;

  // Debounced "is this taken?" check while typing — same shape any username field elsewhere expects.
  // Skipped entirely once the candidate matches what's already saved (nothing to check).
  useEffect(() => {
    let active = true;
    setUsernameError(null);
    if (!editTarget || !usernameChanged) {
      setUsernameCheck(null);
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(trimmedUsername)) {
      setUsernameCheck({
        candidate: trimmedUsername,
        checking: false,
        valid: false,
        available: false,
      });
      return;
    }
    setUsernameCheck({
      candidate: trimmedUsername,
      checking: true,
      valid: true,
      available: false,
    });
    const handle = setTimeout(() => {
      authFetch(
        `/api/vcut/profile/username-available?u=${encodeURIComponent(trimmedUsername)}`,
      )
        .then(async (res) => {
          if (!res.ok) throw new Error("Availability check failed");
          return res.json() as Promise<{ valid: boolean; available: boolean }>;
        })
        .then((body) => {
          if (active)
            setUsernameCheck({
              candidate: trimmedUsername,
              checking: false,
              ...body,
            });
        })
        .catch(() => {
          if (!active) return;
          setUsernameCheck(null);
          setUsernameError(
            "Couldn't check availability. Try again in a moment.",
          );
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [trimmedUsername, usernameChanged, editTarget]);

  async function saveUsername() {
    if (!canSaveUsername || savingUsername) return;
    setSavingUsername(true);
    setUsernameError(null);
    try {
      const res = await authFetch("/api/vcut/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        username?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setUsernameError(
          body.error ?? "Couldn't save that username — try again in a moment.",
        );
        return;
      }
      setUsernameField(body.username ?? "");
      setSavedUsername(body.username ?? null);
      setUsernameCheck(null);
      setInfo((prev) =>
        prev ? { ...prev, username: body.username ?? null } : prev,
      );
    } catch {
      setUsernameError("Couldn't save that username — try again in a moment.");
    } finally {
      setSavingUsername(false);
    }
  }

  function changeLanguage(next: "en" | "km") {
    setLanguage(next);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  }

  async function upgrade() {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await startCheckout();
    } catch {
      setError("Couldn't start checkout — try again in a moment.");
      setBusy(false);
    }
  }

  async function manageBilling() {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await openBillingPortal();
    } catch {
      setError("Couldn't open the billing portal — try again in a moment.");
      setBusy(false);
    }
  }

  function shareProfile() {
    const handle = savedUsername ?? user?.id;
    if (!handle) return;
    const url = `${window.location.origin}${profilePath(user?.id ?? handle, savedUsername)}`;
    if (navigator.share)
      navigator
        .share({ title: displayNameOrFallback(savedDisplayName), url })
        .catch(() => {});
    else navigator.clipboard?.writeText(url).catch(() => {});
  }

  const isPro = status?.plan === "pro";
  const usagePercent =
    usage && usage.capBytes > 0
      ? Math.min(100, Math.round((usage.usedBytes / usage.capBytes) * 100))
      : 0;
  const canSaveUsername =
    usernameChanged &&
    usernameCheck !== null &&
    usernameCheck.candidate === trimmedUsername &&
    !usernameCheck.checking &&
    usernameCheck.valid &&
    usernameCheck.available;
  const shownTemplates = info
    ? tab === "templates"
      ? info.templates
      : info.likedTemplates
    : [];

  return (
    <main
      className="mx-auto max-w-sm px-4 py-8 text-white sm:py-12"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (settingsOpen) setSettingsOpen(false);
        else if (editTarget) closeProfileEditor();
      }}
    >
      {/* Desktop's own sign-in entry point — the hosted web build never reaches this: a signed-out
          visitor there is already redirected to `/login` by `(tabs)/layout.tsx`'s own gate before this
          page ever renders. Same `vcut://` system-browser round trip `VCutApp.tsx`'s header button
          already uses; `(tabs)/layout.tsx` is what actually catches its return now (see that file's own
          doc comment) so this works even though no project is open. */}
      {!HOSTED && user === null && isDesktopSignInAvailable() && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-medium text-white">Sign in to VCut</p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/50">
            Sync your Pro plan and AI credits across devices.
          </p>
          <button
            onClick={openDesktopSignIn}
            className="btn-brand-gradient mt-4 rounded-md px-3.5 py-2 text-xs font-semibold text-white"
          >
            Sign in
          </button>
        </div>
      )}

      {!HOSTED && user && <p className="text-xs text-white/40">{user.email}</p>}

      {HOSTED && user && !settingsOpen && (
        <>
          <div className="flex items-center gap-4">
            <Avatar seed={user.id} displayName={savedDisplayName} size={72} />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold">
                <button
                  onClick={() => openProfileEditor("name")}
                  aria-label="Edit creator name"
                  aria-expanded={editTarget !== null}
                  aria-controls="profile-editor"
                  className="block w-full truncate rounded text-left hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  {displayNameOrFallback(savedDisplayName)}
                </button>
              </h1>
              <button
                onClick={() => openProfileEditor("username")}
                aria-label="Edit username"
                aria-expanded={editTarget !== null}
                aria-controls="profile-editor"
                className="mt-0.5 block w-full truncate rounded text-left text-xs text-white/40 hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                {savedUsername ? `@${savedUsername}` : user.email}
              </button>
            </div>
          </div>

          {info && (
            <div className="mt-5 flex items-center gap-6">
              <div className="text-center">
                <p className="text-base font-semibold">
                  {formatCount(info.followingCount)}
                </p>
                <p className="text-[11px] text-white/50">Following</p>
              </div>
              <div className="text-center">
                <p className="text-base font-semibold">
                  {formatCount(info.followerCount)}
                </p>
                <p className="text-[11px] text-white/50">Followers</p>
              </div>
              <div className="text-center">
                <p className="text-base font-semibold">
                  {formatCount(info.totalLikes)}
                </p>
                <p className="text-[11px] text-white/50">Likes</p>
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              ref={editTrigger}
              onClick={() =>
                editTarget ? closeProfileEditor() : openProfileEditor("name")
              }
              disabled={savingName || savingUsername}
              aria-expanded={editTarget !== null}
              aria-controls="profile-editor"
              className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/10 py-2 text-center text-xs font-medium text-white transition hover:bg-white/15 disabled:opacity-40"
            >
              {editTarget ? "Close editor" : "Edit profile"}
            </button>
            <button
              ref={settingsTrigger}
              onClick={() => {
                closeProfileEditor();
                setSettingsOpen(true);
              }}
              disabled={savingName || savingUsername}
              aria-label="Open account settings"
              title="Account settings"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/[0.03] text-white/70 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40"
            >
              <Settings size={17} aria-hidden="true" />
            </button>
            <button
              onClick={shareProfile}
              aria-label="Share your profile"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/[0.03] text-white"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <circle cx="18" cy="5" r="2.5" />
                <circle cx="6" cy="12" r="2.5" />
                <circle cx="18" cy="19" r="2.5" />
                <path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" />
              </svg>
            </button>
          </div>

          {editTarget && (
            <div
              id="profile-editor"
              className="mt-6 space-y-4 rounded-lg border border-white/10 bg-white/[0.03] p-4"
            >
              {nameError && (
                <p role="alert" className="text-xs text-amber-200/80">
                  {nameError}
                </p>
              )}
              <div>
                <label
                  htmlFor="profile-name"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/40"
                >
                  Creator name
                </label>
                <div className="flex gap-2">
                  <input
                    ref={nameInput}
                    disabled={savingName}
                    id="profile-name"
                    maxLength={60}
                    value={displayName}
                    onChange={(e) => setDisplayNameField(e.target.value)}
                    placeholder="Your creator name"
                    className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30"
                  />
                  {displayName.trim() !== (savedDisplayName ?? "") && (
                    <button
                      onClick={() => void saveDisplayName()}
                      disabled={savingName}
                      className="shrink-0 rounded-md bg-white/10 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                    >
                      {savingName ? "…" : "Save"}
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-white/35">
                  Shown on any template you publish — Discover, comments, and
                  your own creator page.
                </p>
              </div>

              <div>
                <label
                  htmlFor="profile-username"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/40"
                >
                  Username
                </label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/30">
                      @
                    </span>
                    <input
                      ref={usernameInput}
                      disabled={savingUsername}
                      id="profile-username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      aria-describedby="username-status"
                      value={username}
                      onChange={(e) =>
                        setUsernameField(e.target.value.toLowerCase())
                      }
                      placeholder="yourname"
                      maxLength={20}
                      className="w-full rounded-md border border-white/10 bg-white/[0.03] py-2 pl-7 pr-3 text-sm text-white placeholder:text-white/30"
                    />
                  </div>
                  {usernameChanged && (
                    <button
                      onClick={() => void saveUsername()}
                      disabled={savingUsername || !canSaveUsername}
                      className="shrink-0 rounded-md bg-white/10 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                    >
                      {savingUsername ? "…" : "Save"}
                    </button>
                  )}
                </div>
                {usernameChanged ? (
                  <p
                    id="username-status"
                    role="status"
                    className={`mt-1.5 text-[11px] ${
                      usernameError ||
                      (usernameCheck &&
                        !usernameCheck.checking &&
                        (!usernameCheck.valid || !usernameCheck.available))
                        ? "text-amber-200/80"
                        : usernameCheck?.available
                          ? "text-emerald-300/80"
                          : "text-white/40"
                    }`}
                  >
                    {usernameError
                      ? usernameError
                      : !usernameCheck ||
                          usernameCheck.candidate !== trimmedUsername ||
                          usernameCheck.checking
                        ? "Checking…"
                        : !usernameCheck.valid
                          ? "3-20 characters: lowercase letters, numbers, and underscores only"
                          : !usernameCheck.available
                            ? "That username is already taken"
                            : `vcut.io/@${trimmedUsername} is available`}
                  </p>
                ) : (
                  !savedUsername && (
                    <p className="mt-1.5 text-[11px] text-white/35">
                      Pick a username for a readable profile link.
                    </p>
                  )
                )}
              </div>
            </div>
          )}
        </>
      )}

      {HOSTED && user && info && !settingsOpen && (
        <>
          <div className="mt-8 flex border-b border-white/10">
            {(["templates", "liked"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 border-b-2 pb-2.5 text-sm font-medium transition ${
                  tab === t
                    ? "border-white text-white"
                    : "border-transparent text-white/40"
                }`}
              >
                {t === "templates" ? "Templates" : "Liked content"}
              </button>
            ))}
          </div>

          {shownTemplates.length === 0 ? (
            <p className="mt-6 text-xs text-white/40">
              {tab === "templates"
                ? "No published templates yet."
                : "Nothing liked yet."}
            </p>
          ) : (
            <div className="mt-4 columns-2 gap-3">
              {shownTemplates.map((tpl) => (
                <a
                  key={tpl.id}
                  href={`/t/${encodeURIComponent(tpl.id)}`}
                  className="group mb-3 block w-full break-inside-avoid overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]"
                >
                  <div className="aspect-[9/16] w-full bg-black">
                    <video
                      src={templatePreviewUrl(tpl.id)}
                      poster={templatePosterUrl(tpl.id)}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="truncate px-2 py-1.5 text-xs text-white/80">
                    {tpl.name}
                  </p>
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {(!HOSTED || settingsOpen) && (
        <div className={HOSTED ? "" : "mt-10 border-t border-white/10 pt-8"}>
          {HOSTED && (
            <button
              onClick={() => setSettingsOpen(false)}
              className="mb-6 flex items-center gap-2 rounded text-xs text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  d="m15 18-6-6 6-6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Back to profile
            </button>
          )}
          <h2
            ref={settingsHeading}
            tabIndex={-1}
            className="mb-6 text-lg font-semibold outline-none"
          >
            Settings
          </h2>

          {user && !status && (
            <p className="text-center text-xs text-white/40">Loading…</p>
          )}

          {status && (
            <>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/60">Plan</span>
                  <span
                    className={`text-sm font-semibold ${isPro ? "text-sky-300" : "text-white"}`}
                  >
                    {isPro ? "VCut Pro" : "Free"}
                  </span>
                </div>
                {isPro && status.currentPeriodEnd && (
                  <p className="mt-1.5 text-[11px] text-white/35">
                    Renews{" "}
                    {new Date(status.currentPeriodEnd).toLocaleDateString()}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="text-sm text-white/60">Credits</span>
                  <span className="text-sm font-semibold text-white">
                    {status.creditsRemaining}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-white/35">
                  Refills {new Date(status.creditsResetAt).toLocaleDateString()}
                </p>
              </div>

              {error && (
                <p className="mt-3 text-xs text-amber-200/80">{error}</p>
              )}

              <button
                onClick={() => void (isPro ? manageBilling() : upgrade())}
                disabled={busy}
                className="btn-brand-gradient mt-4 w-full rounded-md py-2.5 text-sm font-semibold text-white transition disabled:cursor-default disabled:opacity-50"
              >
                {busy
                  ? "One moment…"
                  : isPro
                    ? "Manage billing"
                    : "Upgrade to Pro"}
              </button>

              {usage && (
                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>Storage</span>
                    <span>
                      {formatFileSize(usage.usedBytes)} /{" "}
                      {formatFileSize(usage.capBytes)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${usagePercent > 90 ? "bg-amber-400" : "bg-sky-400"}`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="mt-8">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/40">
              Language
            </span>
            <div className="flex gap-2">
              {(["en", "km"] as const).map((code) => (
                <button
                  key={code}
                  onClick={() => changeLanguage(code)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                    language === code
                      ? "border-sky-400 bg-sky-500/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25"
                  }`}
                >
                  {code === "en" ? "English" : "ខ្មែរ"}
                </button>
              ))}
            </div>
          </div>

          {user && (
            <button
              // Desktop has nowhere to redirect TO on sign-out (`/login` is the hosted web flow's own
              // page — desktop's own sign-IN never navigates there either, see the button above); staying
              // on this same tab with `user` now `null` is correct there, same as any other state change.
              onClick={() =>
                void signOut().then(() => HOSTED && router.replace("/login"))
              }
              className="mt-8 w-full rounded-md border border-white/10 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </main>
  );
}
