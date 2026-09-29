"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "@veasnawt/vicons";

export default function DeleteAccountPage() {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/vcut/account/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), reason: reason.trim() || undefined }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to submit request. Please try again.");
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0d11] text-zinc-100 antialiased">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <header className="mb-8 border-b border-white/10 pb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sky-400 hover:text-sky-300"
          >
            <ArrowLeft size={13} /> Back to VCut
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Account &amp; Data Deletion
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Transparency on how to request the deletion of your VCut account, what information is permanently removed, and our data retention policy.
          </p>
        </header>

        <div className="space-y-8 text-sm leading-relaxed text-zinc-300">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-white">How to Delete Your Account</h2>
            <p className="mt-2 text-zinc-400">
              You can delete your VCut account and associated data through either the mobile application or by submitting a web request below.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/5 bg-black/30 p-4">
                <span className="inline-block rounded-md bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-400">
                  Option 1: Mobile App
                </span>
                <h3 className="mt-2 text-sm font-semibold text-white">Within the VCut App</h3>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-zinc-400">
                  <li>Open the VCut app on your Android or iOS device.</li>
                  <li>Tap the <strong className="text-zinc-200">Me</strong> tab at the bottom.</li>
                  <li>Tap <strong className="text-zinc-200">Settings</strong> (gear icon).</li>
                  <li>Select <strong className="text-zinc-200">Feedback / Support</strong> or <strong className="text-zinc-200">Delete Account</strong>.</li>
                  <li>Confirm your deletion request.</li>
                </ol>
              </div>

              <div className="rounded-xl border border-white/5 bg-black/30 p-4">
                <span className="inline-block rounded-md bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-400">
                  Option 2: Direct Email
                </span>
                <h3 className="mt-2 text-sm font-semibold text-white">Email the Operator</h3>
                <p className="mt-2 text-xs text-zinc-400">
                  Send an email from your registered account email to:
                </p>
                <div className="mt-2">
                  <a
                    href="mailto:support@vcut.io?subject=Account%20Deletion%20Request"
                    className="font-mono text-xs text-sky-400 underline hover:text-sky-300"
                  >
                    support@vcut.io
                  </a>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Include &ldquo;Account Deletion Request&rdquo; in the subject line. We will verify ownership and process the deletion.
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-white/10 pt-6">
              <h3 className="text-sm font-semibold text-white">Option 3: Submit a Web Request</h3>
              <p className="mt-1 text-xs text-zinc-400">
                If you no longer have access to the app, submit your account email below to initiate deletion.
              </p>

              {submitted ? (
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-300">
                  <div className="flex items-center gap-2 font-medium">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Deletion Request Submitted
                  </div>
                  <p className="mt-1.5 text-xs text-emerald-400/90 leading-normal">
                    We have received your request for <strong>{email}</strong>. Our team will verify ownership and complete permanent deletion of your data within 30 days.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
                  <div>
                    <label htmlFor="email" className="block text-xs font-medium text-zinc-300">
                      Account Email Address <span className="text-rose-400">*</span>
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-2 text-sm text-white placeholder-zinc-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                    />
                  </div>

                  <div>
                    <label htmlFor="reason" className="block text-xs font-medium text-zinc-300">
                      Reason / Notes <span className="text-zinc-500">(optional)</span>
                    </label>
                    <textarea
                      id="reason"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Optional feedback on why you're leaving..."
                      className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-2 text-sm text-white placeholder-zinc-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                    />
                  </div>

                  {errorMessage && (
                    <p className="text-xs text-rose-400">{errorMessage}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {submitting ? "Submitting..." : "Submit Deletion Request"}
                  </button>
                </form>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">What Data Will Be Deleted</h2>
            <p className="text-zinc-400">
              When an account is deleted, all associated personal and user-generated data is permanently purged from our active systems:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-400">
              <li><strong className="text-zinc-200">Account Identity</strong>: Login credentials, email address, password hash, and OAuth authentication tokens.</li>
              <li><strong className="text-zinc-200">Profile Information</strong>: Creator handle, display name, avatar, bio, and public social stats.</li>
              <li><strong className="text-zinc-200">Cloud Projects &amp; Timelines</strong>: Cloud-synced projects, edit histories, cut lists, captions, and keyframe configurations.</li>
              <li><strong className="text-zinc-200">Uploaded Media</strong>: Videos, photos, audio clips, custom fonts, LUTs, and generated video thumbnails stored in your cloud library.</li>
              <li><strong className="text-zinc-200">Community Content</strong>: Published templates, review comments, feedback messages, likes, and followers.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">What Data Is Retained (And Why)</h2>
            <p className="text-zinc-400">
              Certain minimal records may be retained after account deletion where strictly required by law or legitimate security interests:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-400">
              <li><strong className="text-zinc-200">Financial &amp; Invoicing Records</strong>: Google Play order tokens and Stripe transaction IDs are retained for statutory accounting and tax compliance periods (typically 5 to 7 years depending on jurisdiction). These records do not contain user passwords or creative media.</li>
              <li><strong className="text-zinc-200">Security &amp; Abuse Records</strong>: De-identified moderation logs and cryptographic hashes of reported severe abuse may be retained temporarily to prevent malicious re-registration and fraud.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Retention Period &amp; Timeline</h2>
            <p className="text-zinc-400">
              Upon receiving and verifying a deletion request:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-400">
              <li>Your account is <strong className="text-zinc-200">immediately deactivated</strong> and your profile and public templates are unlisted from all feeds.</li>
              <li>Complete data destruction across all operational databases, cache layers, and cloud storage buckets is completed within <strong className="text-zinc-200">30 calendar days</strong>.</li>
              <li>Encrypted off-site disaster recovery backups overwrite deleted records within our standard backup cycle (maximum 90 days).</li>
            </ul>
          </section>

          <footer className="border-t border-white/10 pt-6 text-xs text-zinc-500">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>VCut &middot; Video Editor</span>
              <div className="flex items-center gap-4">
                <Link href="/privacy" className="text-sky-400 hover:text-sky-300">
                  Privacy Policy
                </Link>
                <Link href="/login" className="text-sky-400 hover:text-sky-300">
                  Sign In
                </Link>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
