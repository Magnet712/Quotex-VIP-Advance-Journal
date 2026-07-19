import { NormalizedTick, NormalizedCandle } from "../types";

export interface CacheMetrics {
  currentSize: number;
  overwriteCount: number;
  droppedTicks: number;
  droppedCandles: number;
  validationFailures: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class CandleCache {
  private static caches = new Map<string, NormalizedCandle[]>();
  private static currentTicks = new Map<string, NormalizedTick[]>();
  private static cacheTimestamps = new Map<string, number>();
  private static MAX_CAPACITY = 200;
  private static CACHE_TTL_MS = 60000;

  // Cache debug counters
  private static metrics = new Map<string, CacheMetrics>();

  private static getOrInitMetrics(pair: string): CacheMetrics {
    let m = this.metrics.get(pair);
    if (!m) {
      m = { currentSize: 0, overwriteCount: 0, droppedTicks: 0, droppedCandles: 0, validationFailures: 0 };
      this.metrics.set(pair, m);
    }
    return m;
  }

  /**
   * Validates a batch of candles before they enter the cache.
   * Checks: complete OHLC, finite numbers, no NaN, ascending timestamps,
   * no duplicate timestamps, no zero prices, correct final timestamp.
   */
  public static validateCandles(candles: NormalizedCandle[], pair: string): ValidationResult {
    const errors: string[] = [];
    if (!candles || candles.length === 0) {
      return { valid: false, errors: ['Empty candle array'] };
    }

    const seenTimestamps = new Set<string>();

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];

      if (c.open === undefined || c.high === undefined || c.low === undefined || c.close === undefined) {
        errors.push(`Candle ${i}: missing OHLC field`);
      }
      if (!isFinite(c.open) || !isFinite(c.high) || !isFinite(c.low) || !isFinite(c.close)) {
        errors.push(`Candle ${i}: non-finite OHLC value (o=${c.open} h=${c.high} l=${c.low} c=${c.close})`);
      }
      if (isNaN(c.open) || isNaN(c.high) || isNaN(c.low) || isNaN(c.close)) {
        errors.push(`Candle ${i}: NaN in OHLC`);
      }
      if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
        errors.push(`Candle ${i}: non-positive price (o=${c.open} h=${c.high} l=${c.low} c=${c.close})`);
      }
      if (c.high < c.low || c.high < c.open || c.high < c.close) {
        errors.push(`Candle ${i}: high (${c.high}) below low/open/close`);
      }
      if (c.low > c.open || c.low > c.close) {
        errors.push(`Candle ${i}: low (${c.low}) above open/close`);
      }
      if (!c.timestamp || isNaN(new Date(c.timestamp).getTime())) {
        errors.push(`Candle ${i}: invalid timestamp "${c.timestamp}"`);
      }
      if (seenTimestamps.has(c.timestamp)) {
        errors.push(`Candle ${i}: duplicate timestamp "${c.timestamp}"`);
      }
      seenTimestamps.add(c.timestamp);

      if (i > 0) {
        const prev = new Date(candles[i - 1].timestamp).getTime();
        const curr = new Date(c.timestamp).getTime();
        if (curr <= prev) {
          errors.push(`Candle ${i}: non-ascending timestamp (${c.timestamp} <= ${candles[i - 1].timestamp})`);
        }
      }
    }

    const result: ValidationResult = { valid: errors.length === 0, errors };
    if (!result.valid) {
      console.error(`[CandleCache] Validation FAILED for ${pair}: ${errors.join('; ')}`);
    }
    return result;
  }

  /**
   * Appends a valid tick to the current tick aggregator buffer for a pair
   */
  public static addTick(tick: NormalizedTick): void {
    let ticks = this.currentTicks.get(tick.pair);
    if (!ticks) {
      ticks = [];
      this.currentTicks.set(tick.pair, ticks);
    }
    ticks.push(tick);
  }

  /**
   * Records a dropped tick metric
   */
  public static recordDroppedTick(pair: string): void {
    const m = this.getOrInitMetrics(pair);
    m.droppedTicks++;
  }

  /**
   * Resolves the current tick buffer for the active minute interval and pushes a new closed candle
   */
  public static closeMinuteCandle(pair: string, timestampISO: string): NormalizedCandle | null {
    const ticks = this.currentTicks.get(pair) || [];
    this.currentTicks.set(pair, []); // Reset tick buffer

    let history = this.caches.get(pair);
    if (!history) {
      history = [];
      this.caches.set(pair, history);
    }

    let open = 0, high = -Infinity, low = Infinity, close = 0, volume = 0, delta = 0;

    const m = this.getOrInitMetrics(pair);

    if (ticks.length === 0) {
      // If no ticks arrived, carry over the close price from the last candle
      if (history.length > 0) {
        const lastCandle = history[history.length - 1];
        open = lastCandle.close;
        high = lastCandle.close;
        low = lastCandle.close;
        close = lastCandle.close;
        volume = 0;
        delta = 0;
      } else {
        m.droppedCandles++;
        return null;
      }
    } else {
      open = ticks[0].price;
      close = ticks[ticks.length - 1].price;
      
      ticks.forEach(t => {
        high = Math.max(high, t.price);
        low = Math.min(low, t.price);
        volume += t.volume;
        delta += t.volume;
      });
    }

    const lastCvd = history.length > 0 ? history[history.length - 1].cvd : 0;
    const currentCvd = lastCvd + delta;

    const candle: NormalizedCandle = {
      timestamp: timestampISO,
      open,
      high,
      low,
      close,
      volume,
      cvd: currentCvd
    };

    history.push(candle);

    // Enforce fixed-capacity ring buffer limit
    if (history.length > this.MAX_CAPACITY) {
      history.shift();
      m.overwriteCount++;
    }

    m.currentSize = history.length;
    return candle;
  }

  /**
   * Returns the sliding window array of closed candles for the given pair.
   * Returns empty array if the cache entry has exceeded TTL.
   */
  public static getCandles(pair: string): NormalizedCandle[] {
    const writeTime = this.cacheTimestamps.get(pair);
    if (writeTime && Date.now() - writeTime > this.CACHE_TTL_MS) {
      console.warn(`[CandleCache] Cache for ${pair} expired (age: ${(Date.now() - writeTime) / 1000}s > TTL ${this.CACHE_TTL_MS / 1000}s). Returning empty.`);
      this.caches.delete(pair);
      this.cacheTimestamps.delete(pair);
      return [];
    }
    return this.caches.get(pair) || [];
  }

  /**
   * Exposes active metrics for debugging
   */
  public static getCacheMetrics(pair: string): CacheMetrics {
    const m = this.getOrInitMetrics(pair);
    m.currentSize = (this.caches.get(pair) || []).length;
    return m;
  }

  /**
   * Preloads historical candles (used for initial backfills).
   * Validates candles before storing. Only stores if validation passes.
   * Returns true if cache was updated, false if validation rejected the data.
   */
  public static preloadHistory(pair: string, candles: NormalizedCandle[]): boolean {
    const validation = this.validateCandles(candles, pair);
    if (!validation.valid) {
      const m = this.getOrInitMetrics(pair);
      m.validationFailures++;
      console.error(`[CandleCache] Refusing to cache invalid candles for ${pair}: ${validation.errors.join(' | ')}`);
      return false;
    }

    const history = candles.slice(-this.MAX_CAPACITY);
    this.caches.set(pair, history);
    this.cacheTimestamps.set(pair, Date.now());

    const m = this.getOrInitMetrics(pair);
    m.currentSize = history.length;
    console.log(`[CandleCache] Cached ${history.length} valid candles for ${pair}`);
    return true;
  }

  /**
   * Gets the current cache TTL in milliseconds
   */
  public static getTTL(): number {
    return this.CACHE_TTL_MS;
  }

  /**
   * Sets a custom TTL for cache entries
   */
  public static setTTL(ttlMs: number): void {
    this.CACHE_TTL_MS = ttlMs;
  }

  /**
   * Resets all caches
   */
  public static reset(): void {
    this.caches.clear();
    this.currentTicks.clear();
    this.cacheTimestamps.clear();
    this.metrics.clear();
  }
}
