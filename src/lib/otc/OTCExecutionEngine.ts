import {
  OTCExecutionRecord,
  OTCExecutionStatus,
  OTCExecutionSnapshot,
  OTCExecutionListener,
  OTCExecutionConfig,
  DEFAULT_OTC_CONFIG,
  OTC_RUNNING_STATUSES,
  OTC_POPUP_VISIBLE_STATUSES,
  assertValidOTCTransition,
} from './otc-execution-types';
import type { GeneratedSignal } from '@/app/dashboard/signals/generateSignal';
import {
  saveSignal,
  updateSignalResult,
  updateSignalStatus,
} from '@/app/actions/signals';
import { getLatestCandle, getCandleAtTime, getCandleRange } from './index';
import { analyzeCandles, resultToGeneratedSignal } from './indicator-engine';

export class OTCExecutionEngine {
  private records = new Map<string, OTCExecutionRecord>();
  private listeners = new Set<OTCExecutionListener>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private config: OTCExecutionConfig;
  private clockAnchor = 0;
  private perfAnchor = 0;
  private settlingIds = new Set<string>();
  private settlingInProgress = new Set<string>();
  private dismissedIds = new Set<string>();
  private pendingReservations = 0;

  constructor(config?: Partial<OTCExecutionConfig>) {
    this.config = { ...DEFAULT_OTC_CONFIG, ...config };
    this.restoreDismissedIds();
  }

  private restoreDismissedIds(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = JSON.parse(localStorage.getItem('otc_dismissed') || '[]');
      for (const id of stored) this.dismissedIds.add(id);
    } catch { /* ignore corrupt localStorage */ }
  }

  private persistDismissedId(id: string): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = JSON.parse(localStorage.getItem('otc_dismissed') || '[]');
      if (!stored.includes(id)) {
        stored.push(id);
        localStorage.setItem('otc_dismissed', JSON.stringify(stored));
      }
    } catch { /* ignore */ }
  }

  now(): number {
    return this.clockAnchor + (performance.now() - this.perfAnchor);
  }

  syncClock(serverTimeMs: number): void {
    this.clockAnchor = serverTimeMs;
    this.perfAnchor = performance.now();
  }

  subscribe(listener: OTCExecutionListener): () => void {
    this.listeners.add(listener);
    this.emit();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  getSnapshot(): OTCExecutionSnapshot {
    return { records: Array.from(this.records.values()) };
  }

  getActiveScans(): OTCExecutionRecord[] {
    return Array.from(this.records.values()).filter(
      r => OTC_RUNNING_STATUSES.has(r.status)
    );
  }

  getPopupRecords(): OTCExecutionRecord[] {
    return Array.from(this.records.values()).filter(
      r => OTC_POPUP_VISIBLE_STATUSES.has(r.status)
    );
  }

  getTimelineRecords(): OTCExecutionRecord[] {
    return Array.from(this.records.values())
      .filter(r => r.status !== 'REMOVE')
      .sort((a, b) => b.scanStartedAt - a.scanStartedAt);
  }

  getRunningCount(): number {
    return this.getActiveScans().length;
  }

  canScan(): boolean {
    return this.getRunningCount() + this.pendingReservations <= this.config.maxConcurrentScans;
  }

  start(): void {
    if (this.tickTimer) return;
    this.syncClock(Date.now());
    this.tickTimer = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  async loadActiveSignals(): Promise<void> {
    const { getActiveOTCSignals } = await import('@/app/actions/signals');
    const res = await getActiveOTCSignals();
    if (!res.success || !res.signals || res.signals.length === 0) return;

    const now = this.now();
    let changed = false;

    for (const sig of res.signals) {
      if (this.records.has(sig.id)) continue;

      const entryMs = new Date(sig.entry_time).getTime();
      const expiryMs = new Date(sig.expiry_time).getTime();

      let loadStatus: OTCExecutionStatus;
      if (now >= expiryMs) {
        loadStatus = 'SETTLING';
      } else if (now < entryMs) {
        loadStatus = 'WAITING_FOR_ENTRY';
      } else {
        loadStatus = 'PENDING';
      }

      const record: OTCExecutionRecord = {
        id: sig.id,
        pair: sig.pair,
        status: loadStatus,
        direction: (sig.direction as 'CALL' | 'PUT' | 'WAIT') ?? 'WAIT',
        confidence: sig.confidence ?? 80,
        qualityScore: sig.quality_score ?? sig.confidence ?? 80,
        strategy: sig.strategy_name ?? 'Unknown',
        entryPrice: Number(sig.entry_price) ?? 0,
        entryTime: sig.entry_time,
        expiryTime: sig.expiry_time,
        risk: (sig.risk_level as 'LOW' | 'MEDIUM' | 'HIGH') ?? 'MEDIUM',
        recommendation: (sig.direction as 'CALL' | 'PUT' | 'WAIT') ?? 'WAIT',
        scanStartedAt: entryMs - 60000,
        removeAt: null,
        persistenceStatus: 'SAVED',
      };

      this.records.set(sig.id, record);
      changed = true;

      if (now >= expiryMs) {
        // If DB has SETTLING, updateSignalResult will skip (it checks result='PENDING').
        // Reset to PENDING first so settlement can proceed.
        if (sig.result === 'SETTLING') {
          updateSignalStatus(sig.id, 'PENDING').catch(() => {});
        }
        this.settlingIds.add(sig.id);
        this.settlingInProgress.add(sig.id);
        this.resolveSettlement(record).finally(() => {
          this.settlingInProgress.delete(sig.id);
        });
      }
    }

    if (changed) this.emit();
  }

  async loadTerminalSignals(): Promise<void> {
    const { getOTCTimelineSignals } = await import('@/app/actions/signals');
    const res = await getOTCTimelineSignals();
    if (!res.success || !res.signals || res.signals.length === 0) return;

    let changed = false;

    for (const sig of res.signals) {
      if (this.records.has(sig.id) || this.dismissedIds.has(sig.id)) continue;

      const entryMs = new Date(sig.entry_time).getTime();

      this.records.set(sig.id, {
        id: sig.id,
        pair: sig.pair,
        status: sig.result as OTCExecutionStatus,
        direction: (sig.direction as 'CALL' | 'PUT' | 'WAIT') ?? 'WAIT',
        confidence: sig.confidence ?? 80,
        qualityScore: sig.quality_score ?? sig.confidence ?? 80,
        strategy: sig.strategy_name ?? 'Unknown',
        entryPrice: Number(sig.entry_price) ?? 0,
        entryTime: sig.entry_time,
        expiryTime: sig.expiry_time,
        risk: (sig.risk_level as 'LOW' | 'MEDIUM' | 'HIGH') ?? 'MEDIUM',
        recommendation: (sig.direction as 'CALL' | 'PUT' | 'WAIT') ?? 'WAIT',
        scanStartedAt: entryMs - 60000,
        removeAt: null,
        persistenceStatus: 'SAVED',
        expiryPrice: sig.expiry_price ? Number(sig.expiry_price) : undefined,
      });

      changed = true;
    }

    if (changed) this.emit();
  }

  private tick(): void {
    const now = this.now();
    let changed = false;

    for (const record of this.records.values()) {
      const prevStatus = record.status;
      const newStatus = this.processState(record, now);
      if (newStatus !== prevStatus) {
        record.status = newStatus;
        changed = true;
        if (newStatus === 'REMOVE') {
          this.settlingIds.delete(record.id);
        }
      }
      if (record.removeAt !== null && now >= record.removeAt && record.status !== 'REMOVE') {
        record.status = 'REMOVE';
        this.settlingIds.delete(record.id);
        changed = true;
      }
    }

    if (changed) {
      this.emit();
    }
  }

  private processState(record: OTCExecutionRecord, now: number): OTCExecutionStatus {
    switch (record.status) {
      case 'WAITING_FOR_ENTRY': {
        if (record.persistenceStatus === 'SAVING') {
          return 'WAITING_FOR_ENTRY';
        }
        const entryMs = new Date(record.entryTime).getTime();
        if (now >= entryMs) {
          if (record.persistenceStatus === 'SAVED') {
            this.transitionToPending(record);
            return 'PENDING';
          }
          record.status = 'FAILED';
          record.noTradeReason = record.persistenceError || 'Signal persistence failed';
          record.removeAt = this.now() + this.config.autoRemoveDelayMs;
          return 'FAILED';
        }
        return 'WAITING_FOR_ENTRY';
      }
      case 'PENDING': {
        const expiryMs = new Date(record.expiryTime).getTime();
        if (now >= expiryMs) {
          if (record.persistenceStatus !== 'SAVED') {
            record.status = 'FAILED';
            record.noTradeReason = record.persistenceError || 'Signal not persisted';
            record.removeAt = this.now() + this.config.autoRemoveDelayMs;
            return 'FAILED';
          }
          this.transitionToSettling(record);
          return 'SETTLING';
        }
        return 'PENDING';
      }
      case 'SETTLING': {
        if (this.settlingInProgress.has(record.id)) {
          return 'SETTLING';
        }
        const expiryMs = new Date(record.expiryTime).getTime();
        if (now > expiryMs + this.config.settlementTimeoutMs) {
          record.status = 'FAILED';
          record.noTradeReason = 'Settlement timeout';
          record.removeAt = this.now() + this.config.autoRemoveDelayMs;
          return 'FAILED';
        }
        return 'SETTLING';
      }
      default:
        return record.status;
    }
  }

  private transitionToPending(record: OTCExecutionRecord): void {
    assertValidOTCTransition('WAITING_FOR_ENTRY', 'PENDING');
    this.syncStatusToDB(record.id, 'PENDING');
  }

  private transitionToSettling(record: OTCExecutionRecord): void {
    assertValidOTCTransition('PENDING', 'SETTLING');
    if (this.settlingIds.has(record.id)) return;
    this.settlingIds.add(record.id);

    this.settlingInProgress.add(record.id);
    this.resolveSettlement(record).finally(() => {
      this.settlingInProgress.delete(record.id);
    });
  }

  private syncStatusToDB(id: string, status: string): void {
    updateSignalStatus(id, status).catch(() => {});
  }

  private async resolveSettlement(record: OTCExecutionRecord): Promise<void> {
    try {
      const expiryTime = new Date(record.expiryTime);
      const candle = await getCandleAtTime(record.pair, expiryTime);

      if (!candle || candle.close === undefined) {
        record.status = 'FAILED';
        record.noTradeReason = 'No candle data at expiry';
        record.removeAt = this.now() + this.config.autoRemoveDelayMs;
        this.settlingIds.delete(record.id);
        this.emit();
        return;
      }

      const expiryPrice = candle.close;

      // Compute result locally (same formula as updateSignalResult on server)
      const isWin = record.direction === 'CALL'
        ? expiryPrice > record.entryPrice
        : expiryPrice < record.entryPrice;
      record.status = isWin ? 'WIN' : 'LOSS';
      record.expiryPrice = expiryPrice;
      this.settlingIds.delete(record.id);
      this.emit();

      // Persist asynchronously — never blocks UI (same pattern as scan → saveSignal)
      updateSignalResult(record.id, expiryPrice).catch(() => {});
    } catch {
      record.status = 'FAILED';
      record.noTradeReason = 'Settlement execution error';
      record.removeAt = this.now() + this.config.autoRemoveDelayMs;
      this.settlingIds.delete(record.id);
      this.emit();
    }
  }

  async scan(
    pair: string
  ): Promise<{ success: boolean; error?: string; direction?: 'CALL' | 'PUT' | 'WAIT' }> {
    // Normalize short format (e.g., "AUDUSD") to canonical (e.g., "AUD/USD")
    pair = pair.length === 6 && !pair.includes('/')
      ? pair.slice(0, 3) + '/' + pair.slice(3)
      : pair;
    this.pendingReservations++;
    if (!this.canScan()) {
      this.pendingReservations--;
      return { success: false, error: 'Maximum 3 concurrent OTC scans reached' };
    }

    const now = this.now();
    const tempId = crypto.randomUUID();
    const entryTime = this.computeNextCandleTime(now);
    const expiryTime = new Date(entryTime + 60_000);

    const placeholder = this.createScanPlaceholder(
      tempId, pair, now, new Date(entryTime).toISOString(), expiryTime.toISOString()
    );
    this.records.set(tempId, placeholder);
    this.pendingReservations--;
    this.emit();

    const scanTimeout = setTimeout(() => {
      const rec = this.records.get(tempId);
      if (rec && rec.status === 'SCANNING') {
        rec.status = 'FAILED';
        rec.noTradeReason = 'OTC scan exceeded 20-second limit';
        rec.removeAt = this.now() + this.config.autoRemoveDelayMs;
        this.emit();
      }
    }, 20000);

    try {
      // ── Step 1: Fetch latest candle via OTC Router ─────────────────────
      const routerResult = await getLatestCandle(pair, '1m');
      const latestCandle = routerResult.candle;
      const candleSource = routerResult.source;

      // ── Step 2: Fetch history for indicator calculations ──────────────
      const historyMinutes = 60;
      const from = new Date(latestCandle.timestamp.getTime() - historyMinutes * 60_000);
      const history = await getCandleRange(pair, from, new Date(), '1m');

      // Combine: use history + latest candle as the last entry
      const candles = [...history];
      const lastHistoryIdx = candles.findIndex(
        c => c.timestamp.getTime() === latestCandle.timestamp.getTime()
      );
      if (lastHistoryIdx === -1) {
        candles.push(latestCandle);
      } else {
        candles[lastHistoryIdx] = latestCandle;
      }

      // ── Step 3: Compute indicators from candle data ───────────────────
      const indicatorResult = analyzeCandles(candles);

      // ── Step 4: Convert to GeneratedSignal for downstream compat ──────
      const sig = resultToGeneratedSignal(indicatorResult);

      if (!sig) {
        clearTimeout(scanTimeout);
        placeholder.status = 'NO_TRADE';
        placeholder.direction = 'WAIT';
        placeholder.noTradeReason = indicatorResult.noTradeReason || 'Signal quality below threshold';
        placeholder.removeAt = this.now() + this.config.autoRemoveDelayMs;
        this.emit();
        return { success: true, direction: 'WAIT' };
      }

      // ── Step 5: Immediately update UI with computed signal ─────────────
      clearTimeout(scanTimeout);
      placeholder.direction = sig.direction;
      placeholder.confidence = sig.confidence;
      placeholder.strategy = sig.strategy;
      placeholder.entryPrice = Number(sig.entryPrice);
      placeholder.recommendation = sig.direction;
      placeholder.qualityScore = sig.confidence;
      placeholder.risk = sig.risk;
      placeholder.signalData = sig;
      placeholder.status = 'WAITING_FOR_ENTRY';
      placeholder.persistenceStatus = 'SAVING';
      this.emit(); // UI immediately shows CALL/PUT with all values

      // ── Step 6: Persist in background (never blocks UI) ────────────────
      try {
        const saveRes = await saveSignal({
          pair,
          timeframe: '1m',
          direction: sig.direction,
          entry_price: Number(sig.entryPrice),
          entry_time: new Date(entryTime),
          expiry_time: expiryTime,
          strategy_name: sig.strategy,
          confidence: sig.confidence,
          risk_level: sig.risk,
          source: 'live_otc',
          quality_score: sig.confidence,
          is_premium: true,
        });

        if (saveRes.success && saveRes.signalId) {
          const dbId = saveRes.signalId;
          placeholder.id = dbId;
          placeholder.persistenceStatus = 'SAVED';
          this.records.set(dbId, placeholder);
          if (tempId !== dbId) this.records.delete(tempId);
          this.syncStatusToDB(dbId, placeholder.status);
          this.emit();
        } else {
          placeholder.persistenceStatus = 'FAILED';
          placeholder.persistenceError = saveRes.error || 'Failed to persist signal';
          placeholder.status = 'FAILED';
          placeholder.noTradeReason = saveRes.error || 'Signal persistence failed';
          placeholder.removeAt = this.now() + this.config.autoRemoveDelayMs;
          this.emit();
        }
      } catch (persistErr) {
        placeholder.persistenceStatus = 'FAILED';
        placeholder.persistenceError = persistErr instanceof Error ? persistErr.message : 'Persistence error';
        placeholder.status = 'FAILED';
        placeholder.noTradeReason = 'Signal persistence failed';
        placeholder.removeAt = this.now() + this.config.autoRemoveDelayMs;
        this.emit();
      }

      return { success: true, direction: sig.direction as 'CALL' | 'PUT' };
    } catch (err) {
      clearTimeout(scanTimeout);
      const msg = err instanceof Error ? err.message : 'OTC execution error';
      placeholder.status = 'FAILED';
      placeholder.noTradeReason = msg;
      placeholder.removeAt = this.now() + this.config.autoRemoveDelayMs;
      this.emit();
      return { success: false, error: msg };
    }
  }

  private computeNextCandleTime(now: number): number {
    const d = new Date(now);
    d.setUTCSeconds(0);
    d.setUTCMilliseconds(0);
    d.setUTCMinutes(d.getUTCMinutes() + 1);
    return d.getTime();
  }

  private createScanPlaceholder(
    id: string,
    pair: string,
    now: number,
    entryTime: string,
    expiryTime: string
  ): OTCExecutionRecord {
    return {
      id,
      pair,
      status: 'SCANNING',
      direction: 'WAIT',
      confidence: 0,
      qualityScore: 0,
      strategy: 'Analyzing...',
      entryPrice: 0,
      entryTime,
      expiryTime,
      risk: 'LOW',
      recommendation: 'WAIT',
      scanStartedAt: now,
      removeAt: null,
    };
  }

  dismissScan(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    this.dismissedIds.add(id);
    this.persistDismissedId(id);
    if (record.status !== 'REMOVE') {
      if (record.status !== 'FAILED' && record.status !== 'NO_TRADE' && record.status !== 'WIN' && record.status !== 'LOSS' && record.status !== 'REFUND') {
        assertValidOTCTransition(record.status, 'FAILED');
        record.status = 'FAILED';
        record.noTradeReason = 'Manually dismissed';
        record.removeAt = this.now() + this.config.autoRemoveDelayMs;
      }
      assertValidOTCTransition(record.status, 'REMOVE');
      record.status = 'REMOVE';
      this.settlingIds.delete(id);
      this.emit();
    }
  }

  destroy(): void {
    this.stop();
    this.records.clear();
    this.listeners.clear();
    this.settlingIds.clear();
    this.settlingInProgress.clear();
    this.dismissedIds.clear();
  }
}

export const otcEngine = new OTCExecutionEngine();
