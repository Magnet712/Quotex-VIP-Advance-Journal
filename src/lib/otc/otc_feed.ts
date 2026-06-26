/**
 * Live OTC Feed Provider
 *
 * This is a clean, ready-to-integrate stub for a live OTC data provider.
 * Currently throws OTCFeedUnavailableError to trigger automatic fallback
 * to SimulatedFeed — this is the intended behavior.
 *
 * When a real OTC data API becomes available:
 * 1. Replace the body of getLatestCandle() with the API call
 * 2. Map the API response to the OTCCandle format
 * 3. No other files need to change — the abstraction handles routing
 *
 * NOTE: Quotex does not expose a public candle API. This file is the
 * ONLY place that needs updating when a provider is connected.
 */

import type { OTCCandle, CandleProvider } from './types';

// ─── Custom error for feed unavailability ─────────────────────────────────
export class OTCFeedUnavailableError extends Error {
  constructor(reason?: string) {
    super(reason ?? 'Live OTC feed is not available');
    this.name = 'OTCFeedUnavailableError';
  }
}

// ─── Live OTC Feed Provider Implementation ─────────────────────────────────
export class OTCFeedProvider implements CandleProvider {
  /**
   * Attempts to fetch the latest candle from a live OTC data source.
   *
   * TO INTEGRATE A REAL PROVIDER:
   * - Replace the throw below with your API call
   * - Map the response to { pair, timeframe, open, high, low, close, timestamp, source: 'live_otc' }
   *
   * Example integration point:
   *   const response = await fetch(`${process.env.OTC_API_URL}/candle/${pair}`);
   *   const data = await response.json();
   *   return { ...data, source: 'live_otc' };
   */
  async getLatestCandle(pair: string, timeframe = '1m'): Promise<OTCCandle> {
    // ── STUB: No live provider connected ──────────────────────────────────
    // Remove this throw and add real API logic when provider is available.
    throw new OTCFeedUnavailableError(
      `Live OTC feed not connected. No provider configured for pair: ${pair}`
    );
  }

  /**
   * Attempts to fetch a range of candles from the live OTC data source.
   *
   * TO INTEGRATE: Replace throw with your API range call.
   */
  async getCandleRange(
    pair: string,
    from: Date,
    to: Date,
    timeframe = '1m'
  ): Promise<OTCCandle[]> {
    // ── STUB: No live provider connected ──────────────────────────────────
    throw new OTCFeedUnavailableError(
      `Live OTC candle range fetch not available. No provider configured.`
    );
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────
export const otcFeedProvider = new OTCFeedProvider();
