import React from 'react';
import { Scale, FileText } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'vip-support@quotex.journal';

const sections = [
  {
    title: '1. Who We Are',
    body: (
      <p>
        Quotex Advance Journal (&quot;we&quot;, &quot;us&quot;), operated by the individual operator of{' '}
        <strong>Magnet of Trade</strong>, provides an educational trading journal and analytics
        tool. This Privacy Policy explains what personal data we collect and how it is handled.
      </p>
    ),
  },
  {
    title: '2. What We Collect',
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Registration data:</strong> your chosen username, Broker Trader ID, and account credentials.</li>
        <li><strong>Journal data:</strong> the trades, risks, emotions, and performance entries you record in the Service.</li>
        <li><strong>Activity data:</strong> signal scans, filters, and usage of the dashboard features.</li>
        <li><strong>Analytics:</strong> basic behavioral analytics via Microsoft Clarity (pages visited, interactions, session statistics) to improve the Service.</li>
      </ul>
    ),
  },
  {
    title: '3. How We Use Your Data',
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li>To operate the journal, analytics, and premium features you request.</li>
        <li>To verify your Broker Trader ID for membership activation.</li>
        <li>To improve the Service using aggregated, non-identifiable statistics.</li>
        <li>Not sell, rent, or share your data with third parties for their marketing.</li>
      </ul>
    ),
  },
  {
    title: '4. Third-Party Services',
    body: (
      <div className="space-y-2">
        <p>
          The Service runs on <strong>Supabase</strong> (database services) and{' '}
          <strong>Vercel</strong> (hosting), which store data needed for your account and the tool.
          {' '}<strong>Microsoft Clarity</strong> collects anonymous behavior metrics described above.
          Brokers and any other third parties process only what your own actions require (e.g. the
          partner broker you choose to register with).
        </p>
        <p>
          We do not collect or store payment card data. Membership payments are handled manually
          (virtual wallet transfers) and verified outside this Service.
        </p>
      </div>
    ),
  },
  {
    title: '5. Privacy, Security Advisory',
    body: (
      <div className="space-y-2">
        <p>
          We apply reasonable technical measures (secure encryption at rest and in transit,
          private-access controls) to protect your data.
        </p>
        <p>
          <strong>However, no method of transmission over the Internet or storage is 100% secure.</strong>{' '}
          We cannot guarantee absolute security against unauthorized access.
        </p>
      </div>
    ),
  },
  {
    title: '6. Data Ownership & Your Consent',
    body: (
      <p>
        Your journal and trading entries belong to <strong>you</strong>. By scanning signals or
        showing your entries, you own the content and can delete or export it at any time by
        contacting us at {SUPPORT_EMAIL}. By continuing to use the Service, you consent to the
        collection and use described in this Policy.
      </p>
    ),
  },
  {
    title: '7. Changes & Contact',
    body: (
      <div className="space-y-2">
        <p>
          We may update this Policy; the latest version is always published on this page with an
          effective date. For privacy questions, data access, or deletion requests, contact:{' '}
          <strong>{SUPPORT_EMAIL}</strong>.
        </p>
        <p className="text-[9px] text-slate-600 font-mono">
          Effective Date: 08 August 2026 · Governing law: Republic of India
        </p>
      </div>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-16 w-full">
        <div className="space-y-4 text-center mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-neon-green/30 bg-neon-green/5 text-neon-green text-xs font-mono font-semibold tracking-wider uppercase">
            <Scale className="h-3.5 w-3.5" /> Legal
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight uppercase">
            Privacy Policy
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-2xl mx-auto">
            How Quotex Advance Journal collects, uses, and protects your data.
          </p>
        </div>

        <div className="space-y-4">
          {sections.map((s) => (
            <div key={s.title} className="glass-panel p-6 rounded-xl border border-glass-border space-y-2 text-left">
              <h2 className="flex items-center gap-2 text-sm font-mono font-bold text-slate-200 uppercase tracking-wider">
                <FileText className="h-4 w-4 text-gold-vip shrink-0" />
                {s.title}
              </h2>
              <div className="text-xs text-slate-400 leading-relaxed">{s.body}</div>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}