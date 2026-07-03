import { NormalizedTick, NormalizedCandle } from "../types";

export class CandleCache {
  private static caches = new Map<string, NormalizedCandle[]>();
  private static currentTicks = new Map<string, NormalizedTick[]>();
  private static MAX_CAPACITY = 200;

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
        return null;
      }
    } else {
      open = ticks[0].price;
      close = ticks[ticks.length - 1].price;
      
      ticks.forEach(t => {
        high = Math.max(high, t.price);
        low = Math.min(low, t.price);
        volume += t.volume;
        // In trade updates, volume delta is standard
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
    }

    return candle;
  }

  /**
   * Returns the sliding window array of closed candles for the given pair
   */
  public static getCandles(pair: string): NormalizedCandle[] {
    return this.caches.get(pair) || [];
  }

  /**
   * Preloads historical candles (used for initial backfills)
   */
  public static preloadHistory(pair: string, candles: NormalizedCandle[]): void {
    const history = candles.slice(-this.MAX_CAPACITY);
    this.caches.set(pair, history);
  }

  /**
   * Resets all caches
   */
  public static reset(): void {
    this.caches.clear();
    this.currentTicks.clear();
  }
}
