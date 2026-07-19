import type { GeneratedSignal } from '@/app/dashboard/signals/generateSignal';

export type OTCExecutionStatus =
  | 'SCANNING'
  | 'FAILED'
  | 'NO_TRADE'
  | 'WAITING_FOR_ENTRY'
  | 'PENDING'
  | 'SETTLING'
  | 'WIN'
  | 'LOSS'
  | 'REFUND'
  | 'REMOVE';

export const OTC_RUNNING_STATUSES: ReadonlySet<OTCExecutionStatus> = new Set([
  'SCANNING',
  'WAITING_FOR_ENTRY',
  'PENDING',
]);

export const OTC_TERMINAL_STATUSES: ReadonlySet<OTCExecutionStatus> = new Set([
  'WIN',
  'LOSS',
  'REFUND',
  'FAILED',
  'NO_TRADE',
]);

export const OTC_POPUP_VISIBLE_STATUSES: ReadonlySet<OTCExecutionStatus> = new Set([
  'SCANNING',
  'FAILED',
  'WAITING_FOR_ENTRY',
  'PENDING',
  'SETTLING',
]);

const OTC_VALID_TRANSITIONS: Record<OTCExecutionStatus, OTCExecutionStatus[]> = {
  SCANNING: ['FAILED', 'NO_TRADE', 'WAITING_FOR_ENTRY'],
  FAILED: ['REMOVE'],
  'NO_TRADE': ['REMOVE'],
  WAITING_FOR_ENTRY: ['PENDING', 'FAILED'],
  PENDING: ['SETTLING', 'FAILED'],
  SETTLING: ['WIN', 'LOSS', 'REFUND', 'FAILED'],
  WIN: ['REMOVE'],
  LOSS: ['REMOVE'],
  REFUND: ['REMOVE'],
  REMOVE: [],
};

export function assertValidOTCTransition(
  from: OTCExecutionStatus,
  to: OTCExecutionStatus
): void {
  const allowed = OTC_VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(
      `Invalid OTC transition: ${from} → ${to}. Allowed: ${allowed?.join(', ') || 'none'}`
    );
  }
}

export type PersistenceStatus = 'NOT_STARTED' | 'SAVING' | 'SAVED' | 'FAILED';

export interface OTCExecutionRecord {
  id: string;
  pair: string;
  status: OTCExecutionStatus;
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
  noTradeReason?: string;
  signalData?: GeneratedSignal;
  scanStartedAt: number;
  removeAt: number | null;
  expiryPrice?: number;
  persistenceStatus?: PersistenceStatus;
  persistenceError?: string;
}

export interface OTCExecutionSnapshot {
  records: OTCExecutionRecord[];
}

export type OTCExecutionListener = (snapshot: OTCExecutionSnapshot) => void;

export interface OTCExecutionConfig {
  autoRemoveDelayMs: number;
  settlementTimeoutMs: number;
  maxConcurrentScans: number;
}

export const DEFAULT_OTC_CONFIG: OTCExecutionConfig = {
  autoRemoveDelayMs: 300_000,
  settlementTimeoutMs: 30_000,
  maxConcurrentScans: 3,
};
