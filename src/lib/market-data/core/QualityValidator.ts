import { NormalizedTick } from "../types";

export class QualityValidator {
  private static lastValidTicks = new Map<string, NormalizedTick>();
  private static priceHistories = new Map<string, number[]>();
  private static MOVING_AVERAGE_PERIOD = 10;

  /**
   * Verifies if a given timestamp is during standard weekend forex market closures
   * closures: Friday 22:00 UTC to Sunday 21:00 UTC
   */
  public static isWeekend(timestamp: number): boolean {
    const date = new Date(timestamp);
    const day = date.getUTCDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
    const hour = date.getUTCHours();

    if (day === 5 && hour >= 22) return true; // Friday after 22:00 UTC
    if (day === 6) return true;               // All day Saturday
    if (day === 0 && hour < 21) return true;  // Sunday before 21:00 UTC

    return false;
  }

  /**
   * Evaluates if a standardized tick complies with all operational criteria.
   */
  public static validateTick(tick: NormalizedTick): boolean {
    // 1. Basic structural checks
    if (tick.price <= 0 || tick.volume < 0) {
      console.warn(`[QualityValidator] Rejected tick on ${tick.pair}: Non-positive price/volume.`, tick);
      return false;
    }

    // 2. Weekend market check
    if (this.isWeekend(tick.timestamp)) {
      // Reject live feed data during weekend closure periods
      return false;
    }

    const lastTick = this.lastValidTicks.get(tick.pair);

    // 3. Out-of-order check
    if (lastTick) {
      const timeDiff = tick.timestamp - lastTick.timestamp;
      if (timeDiff < -5000) {
        // Tick is more than 5 seconds in the past, reject
        console.warn(`[QualityValidator] Rejected stale tick on ${tick.pair}: lag of ${timeDiff}ms.`);
        return false;
      }
    }

    // 4. Anomaly Spike Check (Percentage deviation from moving average)
    let history = this.priceHistories.get(tick.pair);
    if (!history) {
      history = [];
      this.priceHistories.set(tick.pair, history);
    }

    if (history.length > 0) {
      const sum = history.reduce((a, b) => a + b, 0);
      const movingAvg = sum / history.length;
      
      const pctDeviation = Math.abs(tick.price - movingAvg) / movingAvg;
      
      // Reject price deviations exceeding 2% (0.02)
      if (pctDeviation > 0.02) {
        console.error(`[QualityValidator] Anomaly detected on ${tick.pair}: Price ${tick.price} deviated by ${(pctDeviation * 100).toFixed(2)}% from moving average ${movingAvg}.`);
        return false;
      }
    }

    // Keep history sliding window at a fixed size
    history.push(tick.price);
    if (history.length > this.MOVING_AVERAGE_PERIOD) {
      history.shift();
    }

    this.lastValidTicks.set(tick.pair, tick);
    return true;
  }

  /**
   * Resets validator caches (used for test isolation)
   */
  public static reset(): void {
    this.lastValidTicks.clear();
    this.priceHistories.clear();
  }
}
