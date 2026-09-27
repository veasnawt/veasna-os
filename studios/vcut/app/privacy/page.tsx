"use client";
import Link from "next/link";
import { PrivacyPolicyContent } from "@veasnawt/vcut/src/ui/PrivacyPolicy";
export default function PrivacyPage() {
  return <main className="mx-auto max-w-2xl px-5 py-10 text-white"><Link href="/" className="text-sm font-semibold text-sky-300">← VCut</Link><h1 className="mb-6 mt-6 text-2xl font-semibold">Privacy Policy</h1><PrivacyPolicyContent /><Link href="/me" className="mt-8 inline-block rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm">Open account settings</Link></main>;
}
