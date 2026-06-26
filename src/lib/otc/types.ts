/**
 * OTC Candle Data Abstraction — Shared Types
 *
 * All candle providers (simulated_feed, otc_feed) must return
 * data conforming to this interface so the strategy engine
 * never needs to know where the data comes from.
 */

// ─── Canonical candle format ───────────────────────────────────────────────
export interface OTCCandle {
  pair:      string;    // e.g. "EUR/USD OTC"
  timeframe: string;    // e.g. "1m"
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  timestamp: Date;
  source:    CandleSource;
}

// ─── Source identifiers ────────────────────────────────────────────────────
export type CandleSource = 'simulation' | 'live_otc' | 'manual';

// ─── Signal mode (admin-controlled) ───────────────────────────────────────
export type SignalMode = 'SIMULATION' | 'LIVE_OTC';

// ─── Signal result ─────────────────────────────────────────────────────────
export type SignalResult = 'PENDING' | 'WIN' | 'LOSS';

// ─── Candle provider contract ──────────────────────────────────────────────
export interface CandleProvider {
  /**
   * Returns the latest closed candle for the given pair and timeframe.
   * Throws if data is unavailable (caller should fallback).
   */
  getLatestCandle(pair: string, timeframe?: string): Promise<OTCCandle>;

  /**
   * Returns candles for the given pair in the given time range.
   */
  getCandleRange(
    pair: string,
    from: Date,
    to: Date,
    timeframe?: string
  ): Promise<OTCCandle[]>;
}

// ─── Data router result ────────────────────────────────────────────────────
export interface CandleRouterResult {
  candle:   OTCCandle;
  source:   CandleSource;
  isLive:   boolean;
  fallback: boolean; // true if live feed failed and simulation was used
}
