import React from 'react';
import { Scale, AlertTriangle, FileText } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Link from 'next/link';

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'vip-support@quotex.journal';

const sections = [
  {
    title: '1. The Service',
    body: (
      <p>
        Quotex Advance Journal (&quot;the Service&quot;, operated by the individual operator of{' '}
        <strong>Magnet of Trade</strong>) provides an educational trading journal, analytics, signal
        statistics, and AI-based evaluation tools. The Service is{' '}
        <strong>a tool — not a brokerage, exchange, trading platform, or financial adviser</strong>.
        It does not provide financial advice, trade execution, or guarantee any trading outcomes.
      </p>
    ),
  },
  {
    title: '2. Activation, Approval & Eligibility',
    body: (
      <div className="space-y-2">
        <p>
          Access is granted manually after registration and verification of your Broker Trader ID.
          The operator may <strong>approve, reject, or revoke</strong> membership at any time, at
          the operator&apos;s sole discretion, without obligation to justify the decision.
        </p>
        <p>
          VIP Journal access is a partner-funded benefit: it requires you to have opened a broker
          account through the Service&apos;s partner link. <strong>Activation is not guaranteed</strong>{' '}
          until your Trader ID is verified.
        </p>
        <p>
          You agree to provide truthful information, maintain one account per Trader ID, and not
          create accounts using someone else&apos;s or fabricated Trader IDs.
        </p>
      </div>
    ),
  },
  {
    title: '3. Payments & Fees',
    body: (
      <div className="space-y-2">
        <p>
          VIP Journal access is free with a verified partner-broker account. Premium Signal Pro is a
          paid membership as priced on the Pricing page. Payments are processed as virtual
          wallet transfers and are verified by the operator before access is enabled.
        </p>
        <p>
          Because payment is only available <strong>after&nbsp;approval</strong>, the Service never
          collects payment from unverified or unapproved users. If access enabled after a payment
          becomes unavailable due to a verified technical error, the operator will provide a
          resolution via support (prorated refund or equivalent access).
        </p>
      </div>
    ),
  },
  {
    title: '4. No Financial Advice & Risk Disclaimer',
    body: (
      <div className="space-y-2">
        <p>
          Trading binary options, Forex, and other financial instruments involves significant risk
          of loss and is not suitable for all investors. Signals, analyses, and reported win rates
          are <strong>historical/statistical and educational only — not a guarantee of future results</strong>.
        </p>
        <p>
          Under no circumstances shall the operator be liable for any loss or damage, in whole or in
          part, caused by or relating to any transaction placed by you. Always trade only with
          money you can afford to lose and on your own judgment.
        </p>
      </div>
    ),
  },
  {
    title: '5. Acceptable Use',
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li>No sharing of premium/VIP credentials with non-members.</li>
        <li>No automated scraping, abuse of the referral program, or round-trip deposit schemes.</li>
        <li>No use of the Service to defraud, harass, or mislead others.</li>
        <li>No copying or redistribution of the Service&apos;s proprietary content, branding, or code.</li>
      </ul>
    ),
  },
  {
    title: '6. Lifetime Access & Termination',
    body: (
      <p>
        &quot;VIP Lifetime&quot; means the lifetime of the membership while it is in good standing and
        while these Terms are in force. The operator may suspend or terminate any account for
        fraud, abuse, violation of the Terms, or for operational/security reasons.
      </p>
    ),
  },
  {
    title: '7. Your Data',
    body: (
      <p>
        Your journal, trades, and analytics belong to you. The Service stores and displays your
        activity for your own use. The Service uses security measures (encryption, private-access
        controls) to protect stored data, but provides it &quot;as-is&quot; without warranty against
        unauthorized access beyond reasonable safeguards.
      </p>
    ),
  },
  {
    title: '8. Limitation of Liability',
    body: (
      <p>
        To the maximum extent permitted by law, the operator shall not be liable for any indirect,
        incidental, special, or consequential damages, lost profits, or trading losses arising from
        use of or inability to use the Service.
      </p>
    ),
  },
  {
    title: '9. Governing Law & Disputes',
    body: (
      <p>
        These Terms are governed by the laws of the <strong>Republic of India</strong>. Any dispute
        shall first be addressed amicably with the operator via {SUPPORT_EMAIL}. Should the
        dispute remain unresolved, it shall be subject to the courts of India.
      </p>
    ),
  },
  {
    title: '10. Changes & Contact',
    body: (
      <div className="space-y-2">
        <p>
          The operator may update these Terms at any time; continued use of the Service after a
          change constitutes acceptance. Questions or concerns: <strong>{SUPPORT_EMAIL}</strong>.
        </p>
        <p className="text-[9px] text-slate-600 font-mono">
          Effective Date: 08 August 2026 · Operator: individual operator of Magnet of Trade
        </p>
      </div>
    ),
  },
];

export default function TermsOfServicePage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-16 w-full">
        <div className="space-y-4 text-center mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-neon-green/30 bg-neon-green/5 text-neon-green text-xs font-mono font-semibold tracking-wider uppercase">
            <Scale className="h-3.5 w-3.5" /> Legal
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight uppercase">
            Terms of Service
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-2xl mx-auto">
            These terms govern your use of Quotex Advance Journal — an educational trading tool, not a
            trading platform.
          </p>
        </div>

        <div className="space-y-4">
          {sections.map((s) => (
            <div key={s.title} className="glass-panel p-6 rounded-xl border border-glass-border space-y-2 text-left">
              <h2 className="flex items-center gap-2 text-sm font-mono font-bold text-slate-200 uppercase tracking-wider">
                <FileText className="h-4 w-4 text-neon-green shrink-0" />
                {s.title}
              </h2>
              <div className="text-xs text-slate-400 leading-relaxed">{s.body}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 border border-amber-500/25 bg-amber-500/5 rounded-xl px-4 py-3 space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
            <AlertTriangle className="h-3.5 w-3.5" /> Risk Disclaimer Reminder
          </p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Trading involves risk of loss and is not suitable for everyone. Nothing on this site is
            financial advice and results are not guaranteed. As an{" "}
            <Link href="/" className="text-neon-green underline">educational tool</Link>, Quotex
            Advance Journal accepts no liability for user trading decisions.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}