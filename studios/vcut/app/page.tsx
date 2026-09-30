"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSupabaseSession } from "@veasnawt/auth";
import { ArrowRight, Check, Desktop, Download as DownloadIcon, Music, Shield, Text as TextIcon, Transition, Video } from "@veasnawt/vicons";

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
              <ArrowRight size={16} />
            </Link>

            <Link
              href="/download"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white"
            >
              <DownloadIcon size={16} className="text-zinc-400" />
              Download for Windows
            </Link>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-sky-400" /> No credit card required</span>
            <span>&bull;</span>
            <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-sky-400" /> Zero watermark</span>
            <span>&bull;</span>
            <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-sky-400" /> Web &amp; Desktop</span>
          </div>
        </div>

        {/* Authentic Editor Showcase */}
        <div id="editor-preview" className="relative mx-auto mt-16 max-w-6xl px-4 sm:px-6">
          <div className="relative rounded-2xl border border-white/15 bg-[#12151c] p-2 sm:p-3 shadow-2xl shadow-black/90 ring-1 ring-white/10 group">
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0a0c10]">
              <img
                src="/editor-screenshot.png"
                alt="VCut Video Editor Workspace — Multi-track timeline, Media Drawer, Keyframe Controls, and Properties Inspector"
                className="w-full h-auto block rounded-lg select-none"
                loading="eager"
              />
            </div>
            {/* Ambient edge glow */}
            <div className="pointer-events-none absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-sky-500/15 via-indigo-500/15 to-purple-500/15 opacity-50 blur-xl -z-10" />
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
              <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-5">
                <Video size={20} />
              </div>
              <h3 className="text-base font-semibold text-white">Multi-Track Timeline</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Layer video, audio, sound effects, and typography with magnetic snapping, frame-accurate split/trim, and smooth ripple edits.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition hover:border-white/20 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5">
                <Transition size={20} />
              </div>
              <h3 className="text-base font-semibold text-white">Keyframe Animation</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Animate position, scale, rotation, opacity, and crop. Build dynamic zooms, text reveals, and camera pans with custom easing curves.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition hover:border-white/20 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-5">
                <TextIcon size={20} />
              </div>
              <h3 className="text-base font-semibold text-white">Advanced Typography</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Native support for complex typography including full Khmer script rendering, custom font imports, word timing, and kinetic motion presets.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition hover:border-white/20 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-5">
                <Music size={20} />
              </div>
              <h3 className="text-base font-semibold text-white">Studio Audio &amp; SFX</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Built-in catalog of curated sound effects, audio extraction, waveform editing, and automatic beat detection to align cuts to the rhythm.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition hover:border-white/20 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-5">
                <Desktop size={20} />
              </div>
              <h3 className="text-base font-semibold text-white">Hardware-Accelerated Export</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Render directly to MP4 with local hardware encoding. Fast local rendering without waiting on external server queues.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition hover:border-white/20 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-5">
                <Shield size={20} />
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
            <Link href="/download" prefetch={false} className="hover:text-zinc-300 transition">
              Download
            </Link>
            <Link href="/terms" prefetch={false} className="hover:text-zinc-300 transition">
              Terms
            </Link>
            <Link href="/privacy" prefetch={false} className="hover:text-zinc-300 transition">
              Privacy Policy
            </Link>
            <Link href="/delete-account" prefetch={false} className="hover:text-zinc-300 transition">
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
