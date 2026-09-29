import Link from "next/link";
import { ArrowLeft } from "@veasnawt/vicons";

export const metadata = {
  title: "Terms of Service — VCut",
  description: "Terms and conditions governing the use of VCut video editing applications and services.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-white">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-white/50 hover:text-white transition-colors">
        <ArrowLeft size={14} /> Back to VCut
      </Link>
      
      <h1 className="mb-2 mt-6 text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="text-xs text-white/40 mb-8">Last updated: September 29, 2026</p>

      <article className="space-y-6 text-sm leading-relaxed text-white/70">
        <p>
          Welcome to VCut. These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of VCut software, applications (including Web, Windows desktop, Android, and iOS), and services provided at <span className="text-white font-medium">vcut.io</span> (&ldquo;VCut&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;).
        </p>

        <section>
          <h2 className="mb-2 text-base font-semibold text-white">1. Acceptance of Terms</h2>
          <p>
            By downloading, accessing, or using VCut, you agree to be bound by these Terms. If you do not agree to these Terms, do not use the application or services.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-white">2. Description of Service</h2>
          <p>
            VCut provides video editing software and creative tools, including local timeline editing, export capabilities, optional cloud project synchronization, creator templates, and integrated AI-assisted creative features.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-white">3. User Accounts and Security</h2>
          <p>
            To use certain features, including cloud synchronization and template publishing, you may be required to create an account via Supabase authentication. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized access.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-white">4. User Content and Ownership</h2>
          <p>
            You retain full ownership and intellectual property rights in and to the media, audio, video recordings, and creative projects you import into or export from VCut (&ldquo;User Content&rdquo;). We claim no ownership over your User Content.
          </p>
          <p className="mt-2">
            When you explicitly choose to publish a template or share a project link publicly, you grant VCut a non-exclusive, worldwide license to display and distribute that template for community discovery within VCut.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-white">5. Acceptable Use and Safety</h2>
          <p>
            You agree not to use VCut to create, edit, or distribute content that is illegal, defamatory, harassing, sexually explicit involving minors, hateful, or that infringes upon the intellectual property or privacy rights of any third party.
          </p>
          <p className="mt-2">
            We reserve the right to review reported content, remove public templates or comments that violate these Terms, and suspend or terminate accounts engaging in abusive conduct.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-white">6. Subscriptions and Payments</h2>
          <p>
            Certain advanced capabilities, AI computing credits, or premium templates may require paid subscriptions or one-time purchases. Web billing is processed securely through Stripe, and Android mobile purchases are processed through Google Play Billing. All purchases are governed by the payment terms disclosed at the time of purchase.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-white">7. Disclaimers and Limitation of Liability</h2>
          <p>
            VCut is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, either express or implied. To the maximum extent permitted by applicable law, VCut and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data or production downtime.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-white">8. Account Deletion and Termination</h2>
          <p>
            You may stop using VCut at any time. You can request the complete deletion of your account and associated personal data at any time via our <Link href="/delete-account" className="text-sky-400 underline hover:text-sky-300">Account Deletion Page</Link>.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-white">9. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of VCut following notice of changes constitutes your acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-white">10. Contact Us</h2>
          <p>
            If you have questions about these Terms, you can contact us via in-app feedback (<strong className="text-white">Me → Settings → Feedback</strong>) or review our <Link href="/privacy" className="text-sky-400 underline hover:text-sky-300">Privacy Policy</Link>.
          </p>
        </section>
      </article>

      <div className="mt-10 border-t border-white/10 pt-6 flex flex-wrap gap-4">
        <Link
          href="/privacy"
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs text-white/80 hover:bg-white/10 transition-colors"
        >
          View Privacy Policy
        </Link>
        <Link
          href="/delete-account"
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs text-white/80 hover:bg-white/10 transition-colors"
        >
          Request Account Deletion
        </Link>
      </div>
    </main>
  );
}
