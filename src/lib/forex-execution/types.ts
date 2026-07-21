export type ExecutionStatus =
  | 'SCANNING'
  | 'FAILED'
  | 'NO TRADE'
  | 'WAITING_FOR_ENTRY'
  | 'PENDING'
  | 'SETTLING'
  | 'WIN'
  | 'LOSS'
  | 'REFUND'
  | 'REMOVE';

export const RUNNING_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'SCANNING',
  'WAITING_FOR_ENTRY',
  'PENDING',
]);

export const TERMINAL_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'WIN',
  'LOSS',
  'REFUND',
  'FAILED',
  'NO TRADE',
]);

export const POPUP_VISIBLE_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'SCANNING',
  'FAILED',
  'NO TRADE',
  'WAITING_FOR_ENTRY',
  'PENDING',
  'WIN',
  'LOSS',
  'REFUND',
]);

const VALID_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  SCANNING: ['FAILED', 'NO TRADE', 'WAITING_FOR_ENTRY'],
  FAILED: ['REMOVE'],
  'NO TRADE': ['REMOVE'],
  WAITING_FOR_ENTRY: ['PENDING', 'FAILED'],
  PENDING: ['SETTLING', 'FAILED'],
  SETTLING: ['WIN', 'LOSS', 'REFUND', 'FAILED'],
  WIN: ['REMOVE'],
  LOSS: ['REMOVE'],
  REFUND: ['REMOVE'],
  REMOVE: [],
};

export function assertValidTransition(
  from: ExecutionStatus,
  to: ExecutionStatus
): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(
      `Invalid state transition: ${from} → ${to}. Allowed: ${allowed?.join(', ') || 'none'}`
    );
  }
}

export interface CheckItem {
  label: string;
  checked: boolean;
  text: string;
}

export interface IndicatorValues {
  ema21: number | null;
  sma50: number | null;
  rsi: number | null;
  cci: number | null;
  stochK: number | null;
  stochD: number | null;
  atr: number | null;
  supertrend: number | null;
  supertrendDirection: number;
  bodySize: number;
  upperWick: number;
  lowerWick: number;
}

export interface ExecutionRecord {
  id: string;
  pair: string;
  status: ExecutionStatus;
  direction: 'CALL' | 'PUT' | 'WAIT';
  confidence: number;
  qualityScore: number;
  strategy: string;
  entryPrice: number;
  officialEntryPrice?: number;
  entryTime: string;
  expiryTime: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendation: 'CALL' | 'PUT' | 'WAIT';
  reasons: CheckItem[];
  noTradeReason?: string;
  indicators: IndicatorValues;
  lastCandleTime: string;
  marketBias: string;
  recommendationText: string;
  dataSource: string;
  serverTime: string;
  analysisEngine: string;
  trendStrength: number;
  nextCandleProbability: number;
  avoidReason: string;
  entryReason: string;
  cacheStatus: 'Fresh' | 'Cached';
  cacheAgeSeconds: number;

  scanStartedAt: number;
  removeAt: number | null;
}

export interface EngineSnapshot {
  records: ExecutionRecord[];
}

export type EngineListener = (snapshot: EngineSnapshot) => void;

export interface EngineConfig {
  autoRemoveDelayMs: number;
  settlementTimeoutMs: number;
  maxConcurrentScans: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  autoRemoveDelayMs: 3000,
  settlementTimeoutMs: 15000,
  maxConcurrentScans: 3,
};
