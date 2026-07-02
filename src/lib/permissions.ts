export type MembershipRole = 'free' | 'vip' | 'premium';

export const ROLE_HIERARCHY: Record<MembershipRole, number> = {
  free: 0,
  vip: 1,
  premium: 2,
};

export const FEATURE_MIN_ROLES: Record<string, MembershipRole> = {
  'community': 'free',
  'basic-resources': 'free',
  'journal': 'vip',
  'analytics': 'vip',
  'checklist': 'vip',
  'risk-calculator': 'vip',
  'premium-signals': 'premium',
  'signal-history': 'premium',
  'performance-reports': 'premium',
};

/**
 * Returns the SaaS role string based on the profile flag state.
 */
export function getMembershipRole(profile: { vip_access?: boolean; premium_access?: boolean; [key: string]: any } | null | undefined): MembershipRole {
  if (!profile) return 'free';
  if (profile.premium_access) return 'premium';
  if (profile.vip_access) return 'vip';
  return 'free';
}

/**
 * Determines whether a user's role satisfies the required rank for a feature.
 */
export function canAccess(
  feature: string, 
  profile: { vip_access?: boolean; premium_access?: boolean; [key: string]: any } | null | undefined,
  signalVisibilitySetting?: string
): boolean {
  const userRole = getMembershipRole(profile);
  let requiredRole = FEATURE_MIN_ROLES[feature];

  // Dynamic visibility overrides for signals modules
  if (['premium-signals', 'signal-history', 'performance-reports'].includes(feature)) {
    if (signalVisibilitySetting === 'public') {
      requiredRole = 'free';
    } else if (signalVisibilitySetting === 'vip') {
      requiredRole = 'vip';
    } else if (signalVisibilitySetting === 'premium') {
      requiredRole = 'premium';
    }
  }

  if (!requiredRole) return true; // Accessible by default if not listed

  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Returns a human readable label of the plan containing this feature.
 */
export function getFeatureRequiredRoleLabel(feature: string): string {
  const role = FEATURE_MIN_ROLES[feature];
  if (role === 'premium') return 'Premium Signal Pro';
  if (role === 'vip') return 'VIP Journal';
  return 'Free';
}

/**
 * Returns a list of features with their metadata.
 */
export const FEATURES_LIST = [
  { id: 'journal', name: 'Trading Journal', required: 'vip', desc: 'Advanced multi-asset trading log & ledger manager' },
  { id: 'analytics', name: 'Analytics Dashboard', required: 'vip', desc: 'Trading statistics, charts, and metrics' },
  { id: 'checklist', name: 'Trading Checklist', required: 'vip', desc: 'Enforce pre-trade strategies and guidelines' },
  { id: 'risk-calculator', name: 'Risk Calculator', required: 'vip', desc: 'Position sizing & risk mitigation' },
  { id: 'premium-signals', name: 'Signal Dashboard', required: 'premium', desc: 'Live automated signals feed' },
  { id: 'signal-history', name: 'Signal History', required: 'premium', desc: 'Signal execution records auditing' },
  { id: 'performance-reports', name: 'Performance Reports', required: 'premium', desc: 'Dynamic signal performance reporting' },
  { id: 'community', name: 'Community Access', required: 'free', desc: 'Telegram and YouTube trade updates' }
];

export const FEATURE_BENEFITS: Record<string, string[]> = {
  'premium-signals': [
    'Real-time automated signals feed (OTC & Live Forex Webhooks)',
    '1-Minute expiry entries & direction locks',
    'Confluence triggers (RSI, Stochastic, CVD, ATR, SuperTrend)',
    'Sound notifications on new signal generation',
    'Orderflow buy/sell pressure delta analytics'
  ],
  'signal-history': [
    'Complete permanent history of all generated signals',
    'Date, asset, strategy, and result outcome paginated audits',
    '1-Click formatted CSV exporter logs download',
    'Verification logs proof for strategy credibility checks'
  ],
  'performance-reports': [
    'Interactive stats grid comparing simulation vs OTC vs Forex metrics',
    'Accuracy progression & win rate line chart visualizations',
    'Identify Best, Worst, and Most Active trading assets',
    'Dynamic date filters (Last 7, 30, 90 days, or Custom ranges)'
  ],
  'journal': [
    'Unlimited multi-asset trade logs database entries',
    'Detailed parameters (screenshot file attachments, sessions, qualities)',
    'Risk sizing & trade execution quality scores reviews'
  ],
  'analytics': [
    'Aggregated 10-chart statistical performance progression',
    'Peak account equity drawdown progression charts',
    'Hourly & strategy distribution profit-loss analyses'
  ],
  'checklist': [
    'Interactive pre-trade discipline check listings',
    'Save custom trade verification policies locally',
    'Discipline progress bar indicator'
  ],
  'risk-calculator': [
    'Forex standard / mini / micro position sizing calculations',
    'Pip valuation and lot recommendations based on custom risk percentages'
  ]
};
