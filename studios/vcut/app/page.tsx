import Link from "next/link";
import {
  Video,
  Music,
  ClosedCaption,
  Ai,
  Desktop,
  Download,
  Split,
  Transition,
  ArrowRight,
  Check,
  Lock,
  Share,
} from "@veasnawt/vicons";

export const metadata = {
  title: "VCut — A Focused Video Editor for Short-Form Creative Work",
  description:
    "High-performance video editor designed for short-form storytelling. Multi-track timeline, automated subtitles, audio waveforms, and local hardware rendering.",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#08090d] text-zinc-100 antialiased selection:bg-sky-500/30">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#08090d]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-white">
            <img src="/vcut-logo.png" alt="VCut" className="h-6 w-6" />
            <span>VCut</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-zinc-400">
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#showcase" className="hover:text-white transition-colors">
              Workspace
            </a>
            <a href="#platforms" className="hover:text-white transition-colors">
              Platforms
            </a>
            <Link href="/download" className="hover:text-white transition-colors">
              Download
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/download"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Download size={14} />
              <span>Desktop Installer</span>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-400 transition-colors shadow-sm shadow-sky-500/20"
            >
              <span>Sign In</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28 sm:pb-24">
        {/* Subtle background glow */}
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-b from-sky-500/10 via-indigo-500/5 to-transparent blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-400 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
            <span>VCut Beta 0.2.14 • Web &amp; Windows Desktop</span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl max-w-4xl mx-auto leading-[1.1]">
            A focused video editor for short-form creative work.
          </h1>

          <p className="mt-6 max-w-2xl mx-auto text-base sm:text-lg text-zinc-400 leading-relaxed font-normal">
            Multi-track timeline, automated subtitles, audio waveforms, and local hardware rendering — engineered for fast, precision vertical video editing.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110 active:scale-[0.98]"
            >
              <span>Start Editing — Free</span>
              <ArrowRight size={16} />
            </Link>

            <Link
              href="/download"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white"
            >
              <Download size={16} />
              <span>Download Desktop App</span>
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Check size={14} className="text-emerald-400" />
              <span>No mandatory cloud subscription</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={14} className="text-emerald-400" />
              <span>Local FFmpeg rendering</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={14} className="text-emerald-400" />
              <span>Zero export watermarks</span>
            </span>
          </div>
        </div>

        {/* Real Editor Screenshot Showcase */}
        <div id="showcase" className="relative mx-auto mt-16 max-w-6xl px-4 sm:px-6">
          <div className="relative rounded-2xl border border-white/10 bg-[#0d0f17] p-2 shadow-2xl shadow-black/80 ring-1 ring-white/10">
            {/* Window title bar header */}
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5 mb-2 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-white/10" />
                <span className="h-3 w-3 rounded-full bg-white/10" />
                <span className="h-3 w-3 rounded-full bg-white/10" />
                <span className="ml-2 font-mono text-[11px] text-zinc-400">VCut Workspace — Project: Love Me Not (1080×1920 30fps)</span>
              </div>
              <div className="hidden sm:flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Hardware Accelerated
                </span>
                <span className="text-zinc-600">|</span>
                <span className="font-mono text-zinc-400">00:00:20 / 00:23:00</span>
              </div>
            </div>

            {/* Actual Screenshot from the Live Editor */}
            <div className="overflow-hidden rounded-xl border border-white/5 bg-black">
              <img
                src="/editor-screenshot.png"
                alt="VCut Video Editor Workspace"
                className="w-full h-auto object-cover"
                loading="eager"
              />
            </div>
          </div>

          {/* Genuine Feature Annotations below the screenshot */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Video size={16} className="text-sky-400" />
                <span>Multi-Track Timeline</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400 leading-normal">
                Frame-accurate cuts, thumbnail filmstrips, playhead scrubbing, and independent B-roll video layers.
              </p>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <ClosedCaption size={16} className="text-sky-400" />
                <span>Animated Subtitle Tracks</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400 leading-normal">
                Word-by-word synchronized captions with keyframe diamonds for dynamic text motion and styling.
              </p>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Music size={16} className="text-sky-400" />
                <span>Loudness &amp; Audio Waveforms</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400 leading-normal">
                Full-fidelity stereo waveforms, volume curves, audio ducking, and integrated sound effects library.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Pillars Section */}
      <section id="features" className="border-t border-white/5 py-24 bg-[#0a0c12]">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400">
              Core Capabilities
            </h2>
            <p className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-4xl">
              Engineered for short-form velocity.
            </p>
            <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
              Every tool in VCut is focused on speed, audio sync, and visual impact for modern vertical storytelling.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Pillar 1 */}
            <div className="group rounded-2xl border border-white/5 bg-white/[0.02] p-7 transition hover:border-white/15 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Split size={20} />
              </div>
              <h3 className="mt-5 text-base font-semibold text-white">
                Precision Non-Linear Timeline
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Frame-level cuts, ripple deletes, and multi-track grouping. Move clips rigidly or collapse layers into editable hierarchies without destructive flattening.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="group rounded-2xl border border-white/5 bg-white/[0.02] p-7 transition hover:border-white/15 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <ClosedCaption size={20} />
              </div>
              <h3 className="mt-5 text-base font-semibold text-white">
                AI Voice Detection &amp; Subtitles
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Embedded WebAssembly VAD and transcription produce word-level subtitle timing. Supports custom typography, Khmer text rendering, and animated keyframe styles.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="group rounded-2xl border border-white/5 bg-white/[0.02] p-7 transition hover:border-white/15 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Desktop size={20} />
              </div>
              <h3 className="mt-5 text-base font-semibold text-white">
                Native Desktop &amp; Hardware Export
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Render directly on your GPU using local FFmpeg. No uploading multi-gigabyte files to remote cloud queues. Export finished MP4 files instantly to disk.
              </p>
            </div>

            {/* Pillar 4 */}
            <div className="group rounded-2xl border border-white/5 bg-white/[0.02] p-7 transition hover:border-white/15 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Music size={20} />
              </div>
              <h3 className="mt-5 text-base font-semibold text-white">
                Audio Balancing &amp; SFX Library
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Dual audio channels with responsive volume envelope keyframes. Built-in library of sound effects, whooshes, impacts, and background tracks ready to drop into timeline.
              </p>
            </div>

            {/* Pillar 5 */}
            <div className="group rounded-2xl border border-white/5 bg-white/[0.02] p-7 transition hover:border-white/15 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Transition size={20} />
              </div>
              <h3 className="mt-5 text-base font-semibold text-white">
                Dynamic Transitions &amp; Keyframes
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Linear and custom keyframe motion for position, scale, opacity, rotation, and corner rounding. Apply smooth transitions across adjacent video cuts.
              </p>
            </div>

            {/* Pillar 6 */}
            <div className="group rounded-2xl border border-white/5 bg-white/[0.02] p-7 transition hover:border-white/15 hover:bg-white/[0.04]">
              <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Share size={20} />
              </div>
              <h3 className="mt-5 text-base font-semibold text-white">
                Multi-Platform Aspect Ratios
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Switch effortlessly between 9:16 vertical (Reels, TikTok, Shorts), 1:1 square, and 16:9 widescreen formats. Smart asset scaling prevents awkward letterboxing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Support Section */}
      <section id="platforms" className="border-t border-white/5 py-24 bg-[#08090d]">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400">
              Universal Ecosystem
            </h2>
            <p className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-4xl">
              Edit in browser, on desktop, or mobile.
            </p>
            <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
              VCut is designed to meet your creative workflow on any device.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Web Platform */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                    Live
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">Chrome / Edge</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">Web Studio</h3>
                <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                  Full editor running inside modern browsers using WebCodecs and canvas hardware acceleration.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/5">
                <Link href="/login" className="text-xs font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1">
                  Launch Web App <ArrowRight size={12} />
                </Link>
              </div>
            </div>

            {/* Windows Desktop */}
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.03] p-6 flex flex-col justify-between shadow-lg shadow-sky-500/5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded">
                    Recommended
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">v0.2.14 Beta</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">Windows 64-bit</h3>
                <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                  Dedicated local installer. Encrypted credentials, direct disk file access, and native FFmpeg exports.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/5">
                <Link href="/download" className="text-xs font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1">
                  Download Installer <ArrowRight size={12} />
                </Link>
              </div>
            </div>

            {/* Android Mobile */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                    Closed Beta
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">Build 19</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">Android</h3>
                <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                  Google Play Closed Testing build. Target SDK 36, 16 KB page size alignment, and Play Billing 8.0.0.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/5">
                <span className="text-xs text-zinc-500">Google Play Invite</span>
              </div>
            </div>

            {/* Apple macOS / iOS */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded">
                    In Pipeline
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">macOS / iOS</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">Apple Silicon &amp; iOS</h3>
                <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                  Native macOS DMG installer and iOS mobile app with Photo Library and camera deep integration.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/5">
                <span className="text-xs text-zinc-500">In Development</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer Banner */}
      <section className="border-t border-white/5 py-20 bg-gradient-to-b from-[#0a0c12] to-[#08090d]">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Start creating with VCut today.
          </h2>
          <p className="mt-4 text-sm text-zinc-400 max-w-xl mx-auto">
            Edit directly in your browser or install the standalone Windows desktop application for low-latency hardware rendering.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-8 py-3.5 text-sm font-semibold text-white hover:bg-sky-400 transition shadow-lg shadow-sky-500/20"
            >
              <span>Open Web Editor</span>
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/download"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-3.5 text-sm font-semibold text-zinc-200 hover:bg-white/10 hover:text-white transition"
            >
              <Download size={16} />
              <span>Get Desktop App (.exe)</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#06070a] py-12 text-zinc-500 text-xs">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src="/vcut-logo.png" alt="VCut" className="h-5 w-5 opacity-80" />
              <span className="font-semibold text-zinc-300">VCut</span>
              <span className="text-zinc-600">|</span>
              <span>A focused video editor for short-form creative work.</span>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-zinc-400">
              <Link href="/download" className="hover:text-white transition">
                Download
              </Link>
              <Link href="/privacy" className="hover:text-white transition">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-white transition">
                Terms of Service
              </Link>
              <Link href="/delete-account" className="hover:text-white transition">
                Delete Account
              </Link>
              <a
                href="https://github.com/veasnawt/vcut-releases"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition"
              >
                Releases
              </a>
              <a
                href="https://github.com/veasnawt/veasna-os"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition"
              >
                GitHub
              </a>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-zinc-600 text-[11px]">
            <p>&copy; {new Date().getFullYear()} VCut. All rights reserved.</p>
            <p>Windows is a registered trademark of Microsoft Corporation. Apple, Mac, and macOS are trademarks of Apple Inc.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
