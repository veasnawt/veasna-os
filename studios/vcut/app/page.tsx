"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSupabaseSession } from "@veasnawt/auth";

const HOSTED = process.env.NEXT_PUBLIC_VCUT_HOSTED === "true";

function LandingPage() {
  const router = useRouter();
  const { user } = useSupabaseSession();
  const [activeTab, setActiveTab] = useState<"timeline" | "keyframes" | "captions" | "export">("timeline");

  useEffect(() => {
    if (user) router.replace("/home");
  }, [user, router]);

  if (user === undefined || user) {
    return <main className="min-h-dvh bg-[#0a0c10]" aria-busy="true" />;
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] text-zinc-100 selection:bg-sky-500/30 font-sans antialiased overflow-x-hidden">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0c10]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 text-base font-semibold text-white tracking-tight">
            <img src="/vcut-logo.png" alt="VCut Logo" className="h-7 w-7 rounded-lg shadow-sm" />
            <span className="font-bold">VCut</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-zinc-400">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#editor-preview" className="hover:text-white transition">Editor</a>
            <a href="#platforms" className="hover:text-white transition">Platforms</a>
            <Link href="/download" className="hover:text-white transition">Download</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-semibold text-zinc-300 hover:text-white px-3 py-1.5 transition"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-sky-500/20 hover:brightness-110 active:scale-95 transition"
            >
              Start editing
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 sm:pt-28 sm:pb-24">
        {/* Subtle ambient light */}
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 h-96 w-[45rem] rounded-full bg-gradient-to-b from-sky-500/10 via-indigo-500/5 to-transparent blur-3xl opacity-70" />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3.5 py-1 text-xs font-medium text-sky-400 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
            VCut Studio &bull; Public Beta
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl sm:leading-[1.12]">
            Edit faster. <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-sky-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              Create without limits.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-sm sm:text-base text-zinc-400 leading-relaxed">
            A focused video editor built for high-speed creative workflows. Frame-accurate multi-track timeline, keyframe animations, typography with Khmer script support, and instant hardware export right in your browser or on desktop.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-sky-500/25 transition hover:brightness-110 active:scale-95"
            >
              Start editing &mdash; it&rsquo;s free
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>

            <Link
              href="/download"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white"
            >
              <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download for Windows
            </Link>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-zinc-500">
            <span>✓ No credit card required</span>
            <span>&bull;</span>
            <span>✓ Zero watermark</span>
            <span>&bull;</span>
            <span>✓ Web &amp; Desktop</span>
          </div>
        </div>

        {/* Product Visual Showcase */}
        <div id="editor-preview" className="relative mx-auto mt-16 max-w-5xl px-4 sm:px-6">
          <div className="rounded-2xl border border-white/15 bg-[#12151c] p-2 shadow-2xl shadow-black/80 ring-1 ring-white/10">
            {/* Editor App Chrome Window */}
            <div className="rounded-xl overflow-hidden bg-[#0e1117] border border-white/5">
              {/* Editor Top Bar */}
              <div className="flex items-center justify-between border-b border-white/10 bg-[#161a23] px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-rose-500/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-3 text-xs font-medium text-zinc-400">My Creative Video Project.vcut</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded bg-black/40 px-2 py-0.5 font-mono text-[11px] text-zinc-400">9:16 Vertical</span>
                  <span className="rounded bg-sky-500/20 px-2.5 py-1 text-xs font-semibold text-sky-400">Export MP4</span>
                </div>
              </div>

              {/* Main Workspace (Tools | Preview Canvas | Inspector) */}
              <div className="grid grid-cols-12 border-b border-white/10 h-72 sm:h-84">
                {/* Left Tool Palette */}
                <div className="col-span-2 border-r border-white/10 bg-[#12151c] p-3 flex flex-col gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Library</span>
                  <div className="flex items-center gap-2 rounded-lg bg-white/10 px-2 py-1.5 text-xs text-white font-medium">
                    <span className="text-sky-400">📁</span> Media
                  </div>
                  <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/5 transition">
                    <span className="text-purple-400">T</span> Text
                  </div>
                  <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/5 transition">
                    <span className="text-amber-400">⚡</span> Transitions
                  </div>
                  <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/5 transition">
                    <span className="text-emerald-400">🎵</span> Audio &amp; SFX
                  </div>
                </div>

                {/* Center Canvas Preview */}
                <div className="col-span-7 bg-[#0a0c10] flex flex-col items-center justify-center p-4 relative">
                  <div className="relative aspect-[9/16] h-full max-h-64 rounded-lg bg-zinc-900 border border-white/15 overflow-hidden shadow-lg flex items-center justify-center">
                    {/* Simulated video frame */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-sky-900/40 via-purple-900/30 to-zinc-900 flex items-center justify-center">
                      <div className="text-center p-3">
                        <div className="text-xs font-semibold text-white tracking-wide uppercase drop-shadow">VCut Studio</div>
                        <div className="mt-1 text-[11px] text-sky-300 font-medium">Keyframe Motion Preview</div>
                      </div>
                    </div>
                    {/* Playhead badge */}
                    <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300">
                      00:04:18 / 00:15:00
                    </div>
                  </div>
                </div>

                {/* Right Inspector */}
                <div className="col-span-3 border-l border-white/10 bg-[#12151c] p-3 text-xs space-y-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Transform</div>
                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>Scale</span>
                      <span className="text-white font-mono">100%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full w-2/3 bg-sky-500 rounded-full" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>Opacity</span>
                      <span className="text-white font-mono">100%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full w-full bg-indigo-500 rounded-full" />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-white/10">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Keyframes</span>
                    <div className="mt-1.5 flex gap-1">
                      <span className="h-3 w-3 rotate-45 rounded-sm bg-sky-400 inline-block" />
                      <span className="text-[10px] text-sky-300">Pos (00:02.10)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Multi-Track Timeline */}
              <div className="bg-[#12151c] p-3">
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                  <div className="flex items-center gap-3">
                    <span className="cursor-pointer hover:text-white">◀◀</span>
                    <span className="cursor-pointer text-white font-bold">▶</span>
                    <span className="cursor-pointer hover:text-white">▶▶</span>
                    <span className="font-mono text-[11px] text-sky-400">00:04:18:12</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="rounded bg-white/5 px-2 py-0.5">Split (S)</span>
                    <span className="rounded bg-white/5 px-2 py-0.5">Delete</span>
                  </div>
                </div>

                {/* Track Rows */}
                <div className="space-y-1.5 font-mono text-[10px]">
                  {/* Text Track */}
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-zinc-500 text-right">T1</span>
                    <div className="h-6 flex-1 rounded bg-purple-950/60 border border-purple-500/40 px-2 flex items-center text-purple-300 relative">
                      <span className="truncate">Headline Animated Text</span>
                      <span className="absolute left-1/3 h-2 w-2 rotate-45 bg-amber-400" />
                    </div>
                  </div>
                  {/* Video Track */}
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-zinc-500 text-right">V1</span>
                    <div className="h-8 flex-1 rounded bg-sky-950/60 border border-sky-500/40 px-2 flex items-center justify-between text-sky-300 relative">
                      <span>Intro Clip (4K)</span>
                      <span className="text-[9px] text-sky-400/80">60 FPS</span>
                      <div className="absolute left-[40%] top-0 bottom-0 w-0.5 bg-rose-500 z-10 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                    </div>
                  </div>
                  {/* Audio Track */}
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-zinc-500 text-right">A1</span>
                    <div className="h-6 flex-1 rounded bg-emerald-950/60 border border-emerald-500/40 px-2 flex items-center text-emerald-300">
                      <span>Soundtrack &bull; Beat Detection Active</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Pillars Section */}
      <section id="features" className="py-20 border-t border-white/5 bg-[#0b0e14]">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400">Engineered for Creators</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Professional editing without the bloat
            </p>
            <p className="mt-3 text-sm text-zinc-400">
              Everything you need to produce engaging vertical videos, reels, and stories with complete timeline precision.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition hover:border-white/20 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 text-lg mb-5">
                🎞
              </div>
              <h3 className="text-base font-semibold text-white">Multi-Track Timeline</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Layer video, audio, sound effects, and typography with magnetic snapping, frame-accurate split/trim, and smooth ripple edits.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition hover:border-white/20 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 text-lg mb-5">
                💎
              </div>
              <h3 className="text-base font-semibold text-white">Keyframe Animation</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Animate position, scale, rotation, opacity, and crop. Build dynamic zooms, text reveals, and camera pans with custom easing curves.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition hover:border-white/20 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 text-lg mb-5">
                🔤
              </div>
              <h3 className="text-base font-semibold text-white">Advanced Typography</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Native support for complex typography including full Khmer script rendering, custom font imports, word timing, and kinetic motion presets.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition hover:border-white/20 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg mb-5">
                🎵
              </div>
              <h3 className="text-base font-semibold text-white">Studio Audio &amp; SFX</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Built-in catalog of curated sound effects, audio extraction, waveform editing, and automatic beat detection to align cuts to the rhythm.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition hover:border-white/20 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg mb-5">
                ⚡
              </div>
              <h3 className="text-base font-semibold text-white">Hardware-Accelerated Export</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Render directly to MP4 with local hardware encoding. Fast local rendering without waiting on external server queues.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition hover:border-white/20 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 text-lg mb-5">
                🔒
              </div>
              <h3 className="text-base font-semibold text-white">Privacy-First Architecture</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Your media files stay on your device by default. Cloud sync is completely optional, and your creative work is never used to train public models.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Availability Section */}
      <section id="platforms" className="py-20 border-t border-white/5">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center max-w-xl mx-auto mb-14">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400">Any Device</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-white">
              VCut everywhere you create
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Web */}
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.04] p-6 flex flex-col justify-between">
              <div>
                <span className="inline-block rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                  Live Now
                </span>
                <h3 className="mt-3 text-base font-semibold text-white">Web Browser</h3>
                <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
                  Open VCut directly in Chrome, Edge, Safari, or Firefox with zero download required.
                </p>
              </div>
              <Link
                href="/login"
                className="mt-6 inline-flex items-center text-xs font-semibold text-sky-400 hover:text-sky-300"
              >
                Launch Web Editor &rarr;
              </Link>
            </div>

            {/* Windows Desktop */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 flex flex-col justify-between">
              <div>
                <span className="inline-block rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                  Available (.exe)
                </span>
                <h3 className="mt-3 text-base font-semibold text-white">Windows Desktop</h3>
                <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
                  Full standalone app with local disk storage, native FFmpeg pipeline, and hardware acceleration.
                </p>
              </div>
              <Link
                href="/download"
                className="mt-6 inline-flex items-center text-xs font-semibold text-sky-400 hover:text-sky-300"
              >
                Download for Windows &rarr;
              </Link>
            </div>

            {/* Android */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 flex flex-col justify-between">
              <div>
                <span className="inline-block rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                  Beta Testing
                </span>
                <h3 className="mt-3 text-base font-semibold text-white">Android Mobile</h3>
                <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
                  Native mobile video editing with Google Play Billing. Currently in Google Play Internal Beta.
                </p>
              </div>
              <span className="mt-6 text-xs text-zinc-500">Google Play Store &bull; Beta</span>
            </div>

            {/* macOS & iOS */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 flex flex-col justify-between">
              <div>
                <span className="inline-block rounded-md bg-zinc-500/15 px-2 py-0.5 text-[11px] font-semibold text-zinc-400">
                  In Development
                </span>
                <h3 className="mt-3 text-base font-semibold text-white">Apple macOS &amp; iOS</h3>
                <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
                  Native Apple Silicon and iOS mobile releases currently undergoing Xcode and TestFlight packaging.
                </p>
              </div>
              <span className="mt-6 text-xs text-zinc-500">Coming Soon</span>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-20 border-t border-white/5 relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Ready to bring your videos to life?
          </h2>
          <p className="mt-4 text-sm text-zinc-400 max-w-xl mx-auto">
            Join creators editing vertical videos, reels, and stories with speed and precision. No subscription required to start.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login"
              className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-xl shadow-sky-500/25 hover:brightness-110 active:scale-95 transition"
            >
              Start editing now
            </Link>
            <Link
              href="/download"
              className="rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-zinc-200 hover:bg-white/10 hover:text-white transition"
            >
              Download Desktop
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/40 py-10 text-xs text-zinc-500">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/vcut-logo.png" alt="VCut" className="h-5 w-5 rounded" />
            <span className="font-semibold text-zinc-300">VCut</span>
            <span>&bull;</span>
            <span>&copy; {new Date().getFullYear()} VCut. Built with Veasna OS.</span>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <Link href="/download" className="hover:text-zinc-300 transition">
              Download
            </Link>
            <Link href="/privacy" className="hover:text-zinc-300 transition">
              Privacy Policy
            </Link>
            <Link href="/delete-account" className="hover:text-zinc-300 transition">
              Account Deletion
            </Link>
            <a
              href="https://github.com/veasnawt/veasna-os"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300 transition"
            >
              GitHub (Veasna OS)
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (!HOSTED) router.replace("/home");
  }, [router]);

  if (!HOSTED) return null;
  return <LandingPage />;
}
