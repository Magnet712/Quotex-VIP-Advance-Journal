export interface PersistenceFailureRecord {
  timestamp: string;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: string | null;
  errorHint: string | null;
  httpStatus: number | null;
  pair: string;
  direction: string;
  userId: string | null;
  phase: 'checkApproved' | 'supabaseInsert' | 'exception';
}

export interface PersistenceMetrics {
  totalAttempts: number;
  successfulSaves: number;
  failedSaves: number;
  lastFailures: PersistenceFailureRecord[];
  startTime: string;
  lastAttemptTime: string | null;
}

const MAX_FAILURES_STORED = 50;

class PersistenceDiagnosticsStore {
  private totalAttempts = 0;
  private successfulSaves = 0;
  private failedSaves = 0;
  private lastFailures: PersistenceFailureRecord[] = [];
  private startTime: string;
  private lastAttemptTime: string | null = null;

  constructor() {
    this.startTime = new Date().toISOString();
  }

  recordAttempt(): void {
    this.totalAttempts++;
    this.lastAttemptTime = new Date().toISOString();
  }

  recordSuccess(): void {
    this.successfulSaves++;
  }

  recordFailure(record: PersistenceFailureRecord): void {
    this.failedSaves++;
    this.lastFailures.unshift(record);
    if (this.lastFailures.length > MAX_FAILURES_STORED) {
      this.lastFailures.pop();
    }
  }

  getMetrics(): PersistenceMetrics {
    return {
      totalAttempts: this.totalAttempts,
      successfulSaves: this.successfulSaves,
      failedSaves: this.failedSaves,
      lastFailures: [...this.lastFailures],
      startTime: this.startTime,
      lastAttemptTime: this.lastAttemptTime,
    };
  }

  reset(): void {
    this.totalAttempts = 0;
    this.successfulSaves = 0;
    this.failedSaves = 0;
    this.lastFailures = [];
    this.startTime = new Date().toISOString();
    this.lastAttemptTime = null;
  }
}

export const persistenceDiag = new PersistenceDiagnosticsStore();
