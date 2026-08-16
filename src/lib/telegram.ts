// ─────────────────────────────────────────────────────────────────────────────
// Telegram Social Proof Notifier
// Sends a fire-and-forget message to the public review channel
// whenever a user activates a premium subscription.
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  premium_monthly:  'Premium Monthly',
  premium_6months:  'Premium 6 Months',
  premium_yearly:   'Premium Yearly',
  premium_lifetime: 'Premium Lifetime',
};

function formatPlanName(planId: string): string {
  return PLAN_LABELS[planId] ?? planId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatIST(date: Date): string {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day:      '2-digit',
    month:    'short',
    year:     'numeric',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   true,
  });
}

/**
 * Fire-and-forget: posts a new-member card to the Telegram social proof channel.
 * Never throws — all errors are swallowed silently.
 */
export async function notifyTelegramNewMember(planId: string): Promise<void> {
  const token     = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  if (!token || !channelId) return; // env vars not set — silent exit

  const now     = new Date();
  const dateStr = formatIST(now);
  const plan    = formatPlanName(planId);
  const siteUrl = 'https://quotex-intelligence-journal.vercel.app/pricing';

  const text = [
    '✅ <b>New Premium Member!</b>',
    '',
    `📅 ${dateStr}`,
    `💎 Plan: ${plan}`,
    '',
    `🔗 <a href="${siteUrl}">Join them →</a>`,
  ].join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        chat_id:                  channelId,
        text,
        parse_mode:               'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch {
    // Silent fail — never break the subscription flow
  }
}
