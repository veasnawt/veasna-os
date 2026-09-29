"use client";
import Link from "next/link";
import { ArrowLeft } from "@veasnawt/vicons";
import { PrivacyPolicyContent } from "@veasnawt/vcut/src/ui/PrivacyPolicy";
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-white">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-300 hover:text-sky-200 transition-colors">
        <ArrowLeft size={14} /> VCut
      </Link>
      <h1 className="mb-6 mt-6 text-2xl font-semibold">Privacy Policy</h1>
      <PrivacyPolicyContent />
      <div className="mt-8 flex flex-wrap gap-4">
        <Link
          href="/me"
          className="inline-block rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm hover:bg-white/10"
        >
          Open account settings
        </Link>
        <Link
          href="/delete-account"
          className="inline-block rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 hover:bg-rose-500/20"
        >
          Request Account Deletion
        </Link>
      </div>
    </main>
  );
}
