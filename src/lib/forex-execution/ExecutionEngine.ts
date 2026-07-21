import {
  ExecutionRecord,
  ExecutionStatus,
  EngineSnapshot,
  EngineListener,
  EngineConfig,
  DEFAULT_ENGINE_CONFIG,
  RUNNING_STATUSES,
  POPUP_VISIBLE_STATUSES,
  assertValidTransition,
  CheckItem,
  IndicatorValues,
} from './types';

import {
  createLiveScanAudit,
  scanLiveMarketAsset,
  settleManualSignal,
  captureOfficialEntryPrice,
  getPendingManualSignals,
  getManualSignalAudits,
  updateScanAuditStatus,
  prepareSignalForSettlement,
  ScanResult,
} from '@/app/actions/signals';

export class ExecutionEngine {
  private records = new Map<string, ExecutionRecord>();
  private listeners = new Set<EngineListener>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private config: EngineConfig;
  private clockOffset = 0;
  private clockAnchor = 0;
  private perfAnchor = 0;
  private settlingIds = new Set<string>();
  private pendingReservations = 0;

  constructor(config?: Partial<EngineConfig>) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
  }

  now(): number {
    return this.clockAnchor + (performance.now() - this.perfAnchor);
  }

  syncClock(serverTimeMs: number): void {
    this.clockAnchor = serverTimeMs;
    this.perfAnchor = performance.now();
  }

  // ─── Subscription ────────────────────────────────────────────────────

  subscribe(listener: EngineListener): () => void {
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

  getSnapshot(): EngineSnapshot {
    return { records: Array.from(this.records.values()) };
  }

  // ─── Query helpers for React ─────────────────────────────────────────

  getActiveScans(): ExecutionRecord[] {
    return Array.from(this.records.values()).filter(
      r => RUNNING_STATUSES.has(r.status)
    );
  }

  getPopupRecords(): ExecutionRecord[] {
    return Array.from(this.records.values()).filter(
      r => POPUP_VISIBLE_STATUSES.has(r.status)
    );
  }

  getTimelineRecords(): ExecutionRecord[] {
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

  // ─── Clock tick ──────────────────────────────────────────────────────

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

      // Auto-remove after delay
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

  private processState(record: ExecutionRecord, now: number): ExecutionStatus {
    switch (record.status) {
      case 'SCANNING': {
        const entryMs = new Date(record.entryTime).getTime();
        if (now >= entryMs + 5000) {
          record.status = 'FAILED';
          record.noTradeReason = 'Scan timed out — entry time passed while still scanning';
          record.removeAt = this.now();
          updateScanAuditStatus(record.id, 'FAILED', record.noTradeReason);
          return 'FAILED';
        }
        return 'SCANNING';
      }

      case 'WAITING_FOR_ENTRY': {
        const entryMs = new Date(record.entryTime).getTime();
        if (now >= entryMs) {
          this.transitionToPending(record, entryMs);
          return 'PENDING';
        }
        return 'WAITING_FOR_ENTRY';
      }

      case 'PENDING': {
        const expiryMs = new Date(record.expiryTime).getTime();
        if (now >= expiryMs) {
          this.transitionToSettling(record);
          return 'SETTLING';
        }
        return 'PENDING';
      }

      default:
        return record.status;
    }
  }

  private transitionToPending(record: ExecutionRecord, entryMs: number): void {
    assertValidTransition('WAITING_FOR_ENTRY', 'PENDING');

    captureOfficialEntryPrice(record.id, record.pair, entryMs)
      .then(res => {
        if (res.success && res.officialEntryPrice) {
          record.officialEntryPrice = res.officialEntryPrice;
          record.entryPrice = res.officialEntryPrice;
          this.emit();
        }
      })
      .catch(() => {});
  }

  private transitionToSettling(record: ExecutionRecord): void {
    assertValidTransition('PENDING', 'SETTLING');

    if (this.settlingIds.has(record.id)) return;
    this.settlingIds.add(record.id);

    prepareSignalForSettlement(
      record.id,
      record.officialEntryPrice || record.entryPrice,
      record.direction,
      record.entryTime,
      record.expiryTime,
    );

    settleManualSignal(record.id)
      .then(res => {
        if (res.success && (res.status === 'WIN' || res.status === 'LOSS' || res.status === 'REFUND')) {
          record.status = res.status as ExecutionStatus;
          record.removeAt = this.now() + this.config.autoRemoveDelayMs;
        } else {
          record.status = 'FAILED';
          record.noTradeReason = res.error || 'Settlement failed';
          record.removeAt = this.now();
        }
        this.settlingIds.delete(record.id);
        this.emit();
      })
      .catch(() => {
        record.status = 'FAILED';
        record.noTradeReason = 'Settlement execution error';
        record.removeAt = this.now();
        this.settlingIds.delete(record.id);
        this.emit();
      });
  }

  // ─── Scan lifecycle ──────────────────────────────────────────────────

  async scan(pair: string): Promise<{ success: boolean; error?: string; direction?: 'CALL' | 'PUT' | 'WAIT' }> {
    this.pendingReservations++;
    if (!this.canScan()) {
      this.pendingReservations--;
      return { success: false, error: 'Maximum 3 concurrent scans reached' };
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

    const createRes = await createLiveScanAudit(pair);
    if (!createRes.success || !createRes.rowId) {
      placeholder.status = 'FAILED';
      placeholder.noTradeReason = createRes?.error || 'Failed to create scan record';
      placeholder.removeAt = this.now();
      this.emit();
      return { success: false, error: placeholder.noTradeReason };
    }

    const dbId = createRes.rowId;
    placeholder.id = dbId;
    this.records.set(dbId, placeholder);
    if (tempId !== dbId) this.records.delete(tempId);
    this.emit();

    const scanTimeout = setTimeout(() => {
      if (this.records.get(dbId)?.status === 'SCANNING') {
        placeholder.status = 'FAILED';
        placeholder.noTradeReason = 'Scan exceeded 20-second limit';
        placeholder.removeAt = this.now();
        updateScanAuditStatus(dbId, 'FAILED', placeholder.noTradeReason);
        this.emit();
      }
    }, 20000);

    try {
      const res = await scanLiveMarketAsset(pair, dbId);

      clearTimeout(scanTimeout);

      if (!res.success) {
        this.handleScanFailure(placeholder, res.error || 'Scan failed');
        this.emit();
        return { success: false, error: placeholder.noTradeReason };
      }

      if (!res.result) {
        this.handleScanFailure(placeholder, 'No result returned');
        this.emit();
        return { success: false, error: placeholder.noTradeReason };
      }

      this.handleScanSuccess(placeholder, res, dbId, now);
      this.emit();
      return { success: true, direction: placeholder.direction };
    } catch (err) {
      clearTimeout(scanTimeout);
      const msg = err instanceof Error ? err.message : 'Execution error';
      this.handleScanFailure(placeholder, msg);
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
  ): ExecutionRecord {
    const nowIso = new Date(now).toISOString();
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
      reasons: [],
      noTradeReason: undefined,
      indicators: {
        ema21: null, sma50: null, rsi: null, cci: null,
        stochK: null, stochD: null, atr: null, supertrend: null,
        supertrendDirection: 0, bodySize: 0, upperWick: 0, lowerWick: 0,
      },
      lastCandleTime: nowIso,
      marketBias: 'NEUTRAL',
      recommendationText: 'Analyzing confluence factors...',
      dataSource: 'Twelve Data',
      serverTime: nowIso,
      analysisEngine: 'v1.3',
      trendStrength: 0,
      nextCandleProbability: 0,
      avoidReason: '',
      entryReason: '',
      cacheStatus: 'Fresh',
      cacheAgeSeconds: 0,
      scanStartedAt: now,
      removeAt: null,
    };
  }

  private handleScanSuccess(
    placeholder: ExecutionRecord,
    res: ScanResult,
    dbId: string,
    serverTimeMs: number
  ): void {
    if (placeholder.status !== 'SCANNING') return;
    const result = res.result!;
    this.syncClock(serverTimeMs);

    if (result.direction === 'WAIT') {
      placeholder.status = 'NO TRADE';
      placeholder.direction = 'WAIT';
      placeholder.confidence = 0;
      placeholder.marketBias = result.noTradeReason || 'No setup detected';
      placeholder.recommendationText = result.recommendationText;
      placeholder.noTradeReason = result.noTradeReason || 'No setup detected';
      placeholder.dataSource = result.dataSource;
      placeholder.removeAt = this.now();
      return;
    }

    const entryMs = new Date(result.entryTime).getTime();
    const isNextCandle = entryMs > this.now();

    Object.assign(placeholder, {
      direction: result.direction,
      confidence: result.confidence,
      qualityScore: result.qualityScore,
      strategy: result.strategy,
      entryPrice: result.entryPrice,
      entryTime: result.entryTime,
      expiryTime: result.expiryTime,
      risk: result.risk,
      recommendation: result.recommendation,
      reasons: result.reasons,
      indicators: result.indicators,
      lastCandleTime: result.lastCandleTime,
      marketBias: result.marketBias,
      recommendationText: result.recommendationText,
      dataSource: result.dataSource,
      serverTime: result.serverTime,
      analysisEngine: result.analysisEngine,
      trendStrength: result.trendStrength,
      nextCandleProbability: result.nextCandleProbability,
      avoidReason: result.avoidReason || '',
      entryReason: result.entryReason || '',
      cacheStatus: result.cacheStatus,
      cacheAgeSeconds: result.cacheAgeSeconds,
      status: isNextCandle ? 'WAITING_FOR_ENTRY' : 'PENDING',
    });

    if (!isNextCandle) {
      this.transitionToPending(placeholder, entryMs);
    }
  }

  private handleScanFailure(placeholder: ExecutionRecord, error: string): void {
    if (placeholder.status !== 'SCANNING') return;
    placeholder.status = 'FAILED';
    placeholder.noTradeReason = error;
    placeholder.removeAt = this.now();
  }

  // ─── Manual dismissal ────────────────────────────────────────────────

  dismissScan(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    if (record.status !== 'REMOVE') {
      assertValidTransition(record.status, 'REMOVE');
      record.status = 'REMOVE';
      this.settlingIds.delete(id);
      this.emit();
    }
  }

  // ─── Recovery ────────────────────────────────────────────────────────

  async recover(): Promise<void> {
    try {
      const [pendingRes, auditsRes] = await Promise.all([
        getPendingManualSignals(),
        getManualSignalAudits(),
      ]);

      const now = this.now();

      if (pendingRes.success && pendingRes.signals) {
        for (const sig of pendingRes.signals) {
          const status = sig.status as ExecutionStatus;
          if (!RUNNING_STATUSES.has(status)) continue;

          const entryMs = new Date(sig.entryTime).getTime();
          const expiryMs = new Date(sig.expiryTime).getTime();

          let restoreStatus: ExecutionStatus;
          if (status === 'SCANNING') {
            restoreStatus = 'SCANNING';
          } else if (entryMs > now) {
            restoreStatus = 'WAITING_FOR_ENTRY';
          } else if (expiryMs > now) {
            restoreStatus = 'PENDING';
          } else {
            restoreStatus = 'PENDING';
          }

          const record = this.createScanPlaceholder(
            sig.id,
            sig.pair,
            now,
            sig.entryTime,
            sig.expiryTime
          );

          Object.assign(record, {
            direction: sig.direction || 'WAIT',
            confidence: sig.confidence || 0,
            qualityScore: sig.qualityScore || 0,
            strategy: sig.strategy || 'Restored',
            entryPrice: sig.entryPrice || 0,
            officialEntryPrice: sig.officialEntryPrice || sig.entryPrice,
            status: restoreStatus,
            reasons: sig.reasons || [],
            indicators: sig.indicators || record.indicators,
            lastCandleTime: sig.lastCandleTime || sig.entryTime,
            marketBias: sig.marketBias || '',
            recommendationText: sig.recommendationText || '',
            dataSource: sig.dataSource || 'Restored',
            serverTime: sig.serverTime || new Date().toISOString(),
            risk: sig.risk || 'LOW',
            recommendation: sig.recommendation || 'WAIT',
            noTradeReason: sig.noTradeReason,
            removeAt: null,
          });

          this.records.set(sig.id, record);

          if (restoreStatus === 'PENDING' && now >= expiryMs) {
            this.transitionToSettling(record);
          } else if (restoreStatus === 'WAITING_FOR_ENTRY' && now >= entryMs) {
            this.transitionToPending(record, entryMs);
          } else if (restoreStatus === 'SCANNING') {
            const age = Math.max(0, now - new Date(sig.entryTime).getTime() + 60000);
            const remaining = Math.max(0, 20000 - age);
            if (remaining <= 0) {
              record.status = 'FAILED';
              record.noTradeReason = 'Scan exceeded 20-second limit';
              record.removeAt = this.now();
              updateScanAuditStatus(sig.id, 'FAILED', record.noTradeReason);
            } else {
              setTimeout(() => {
                const r = this.records.get(sig.id);
                if (r && r.status === 'SCANNING') {
                  r.status = 'FAILED';
                  r.noTradeReason = 'Scan exceeded 20-second limit';
                  r.removeAt = this.now();
                  updateScanAuditStatus(sig.id, 'FAILED', r.noTradeReason);
                  this.emit();
                }
              }, remaining);
            }
          }
        }
      }

      if (auditsRes.success && auditsRes.audits) {
        for (const audit of auditsRes.audits) {
          const auditStatus = audit.status as ExecutionStatus;
          if (this.records.has(audit.id)) continue;
          if (auditStatus === 'SCANNING') continue;
          if (TERMINAL_STATUSES.has(auditStatus)) continue;

          const entryMs = new Date(audit.entry_time).getTime();
          const expiryMs = new Date(audit.expiry_time).getTime();

          let restoreStatus: ExecutionStatus;
          if (entryMs > now) {
            restoreStatus = 'WAITING_FOR_ENTRY';
          } else if (expiryMs > now) {
            restoreStatus = 'PENDING';
          } else {
            restoreStatus = 'PENDING';
          }

          const record = this.createScanPlaceholder(
            audit.id,
            audit.pair,
            now,
            audit.entry_time,
            audit.expiry_time
          );

          Object.assign(record, {
            direction: audit.direction || 'WAIT',
            confidence: audit.confidence || 0,
            qualityScore: audit.signal_strength || 0,
            entryPrice: Number(audit.entry_price) || 0,
            status: restoreStatus,
            marketBias: audit.market_bias || '',
            dataSource: audit.provider || '',
            noTradeReason: audit.noTradeReason || audit.market_bias || undefined,
            removeAt: null,
          });

          this.records.set(audit.id, record);

          if (restoreStatus === 'PENDING' && now >= expiryMs) {
            this.transitionToSettling(record);
          } else if (restoreStatus === 'WAITING_FOR_ENTRY' && now >= entryMs) {
            this.transitionToPending(record, entryMs);
          }
        }
      }

      this.emit();
    } catch (err) {
      console.error('[ExecutionEngine] Recovery failed:', err);
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────

  destroy(): void {
    this.stop();
    this.records.clear();
    this.listeners.clear();
    this.settlingIds.clear();
  }
}

const TERMINAL_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'WIN', 'LOSS', 'REFUND', 'FAILED', 'NO TRADE',
]);

export const engine = new ExecutionEngine();
