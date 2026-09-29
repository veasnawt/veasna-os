"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function DownloadPage() {
  const [platform, setPlatform] = useState<"windows" | "mac" | "linux" | "other">("windows");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const ua = window.navigator.userAgent.toLowerCase();
      if (ua.includes("win")) setPlatform("windows");
      else if (ua.includes("mac")) setPlatform("mac");
      else if (ua.includes("linux")) setPlatform("linux");
      else setPlatform("other");
    }
  }, []);

  function handleDownloadClick() {
    setDownloading(true);
    setTimeout(() => setDownloading(false), 4000);
  }

  return (
    <main className="min-h-screen bg-[#0a0c10] text-zinc-100 antialiased selection:bg-sky-500/30">
      {/* Navigation */}
      <nav className="border-b border-white/5 bg-[#0a0c10]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 text-base font-semibold text-white">
            <img src="/vcut-logo.png" alt="VCut" className="h-6 w-6" />
            <span>VCut</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs font-medium text-zinc-400 hover:text-white transition"
            >
              Overview
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-400 transition"
            >
              Open Web App
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        {/* Header */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-400">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
            Desktop Release v0.2.14
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Download VCut for Desktop
          </h1>
          <p className="mt-4 max-w-xl mx-auto text-sm sm:text-base text-zinc-400">
            Experience the full speed of local video editing. Low-latency playback, multi-track timeline, and direct file access without browser sandbox limits.
          </p>
        </div>

        {/* Primary Download Card */}
        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.02] p-8 shadow-2xl backdrop-blur-sm sm:p-10">
          <div className="flex flex-col items-center text-center">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 p-3.5 shadow-lg shadow-sky-500/20 flex items-center justify-center">
              <svg className="h-9 w-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>

            <h2 className="mt-5 text-xl font-semibold text-white">
              {platform === "windows"
                ? "VCut for Windows 64-bit"
                : platform === "mac"
                ? "VCut for macOS"
                : "VCut for Desktop"}
            </h2>
            <p className="mt-1.5 text-xs text-zinc-400">
              {platform === "windows"
                ? "Compatible with Windows 10 & 11 (x64) • Standalone Installer"
                : platform === "mac"
                ? "macOS Apple Silicon & Intel build in progress"
                : "Standalone desktop application with local hardware rendering"}
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
              {platform === "windows" || platform === "other" ? (
                <a
                  href="/dl/desktop"
                  onClick={handleDownloadClick}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110 active:scale-[0.98]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {downloading ? "Starting Download..." : "Download for Windows (.exe)"}
                </a>
              ) : (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-6 py-3 text-xs font-medium text-amber-300">
                  VCut Desktop for {platform === "mac" ? "macOS" : "Linux"} is coming soon. Use the web editor in the meantime!
                </div>
              )}

              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white"
              >
                Launch in Browser
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
              <span>Version: 0.2.14-beta</span>
              <span>•</span>
              <span>SHA-256 Verified</span>
              <span>•</span>
              <a
                href="https://github.com/veasnawt/vcut-releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:text-sky-300 underline"
              >
                View Release Notes &amp; Checksums
              </a>
            </div>
          </div>
        </div>

        {/* System Requirements & Features */}
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-white/5 bg-white/[0.015] p-6">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="text-sky-400">⚙</span> Minimum System Requirements
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-zinc-400">
              <li>• <strong className="text-zinc-200">OS</strong>: Windows 10 (version 1903+) or Windows 11 64-bit</li>
              <li>• <strong className="text-zinc-200">Processor</strong>: Intel Core i3 / AMD Ryzen 3 or higher</li>
              <li>• <strong className="text-zinc-200">Memory</strong>: 4 GB RAM (8 GB recommended for 4K)</li>
              <li>• <strong className="text-zinc-200">Storage</strong>: 1 GB available disk space</li>
              <li>• <strong className="text-zinc-200">Display</strong>: 1280 x 720 minimum resolution</li>
            </ul>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.015] p-6">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="text-sky-400">⚡</span> Why Choose the Desktop App?
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-zinc-400">
              <li>• <strong className="text-zinc-200">Local Hardware Encoding</strong>: Renders video via native local FFmpeg pipeline.</li>
              <li>• <strong className="text-zinc-200">Offline Project Storage</strong>: Projects stay on your local disk with optional cloud sync.</li>
              <li>• <strong className="text-zinc-200">No Upload Bottlenecks</strong>: Import multi-gigabyte video clips instantly.</li>
              <li>• <strong className="text-zinc-200">Cross-Platform Sync</strong>: Sign in to sync your work between web and desktop.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 border-t border-white/10 pt-6 text-xs text-zinc-500 flex flex-wrap items-center justify-between gap-4">
          <span>VCut Desktop &middot; © {new Date().getFullYear()} VCut</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-sky-400 hover:text-sky-300">
              Privacy
            </Link>
            <Link href="/delete-account" className="text-sky-400 hover:text-sky-300">
              Data Deletion
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
