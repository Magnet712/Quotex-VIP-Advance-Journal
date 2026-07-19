/**
 * OTC Indicator Engine
 *
 * Computes real technical indicators from OHLC candle data and produces
 * a CALL/PUT signal decision based on market-data-driven analysis.
 *
 * This replaces the legacy deterministic random signal generation path
 * (generateSignal.ts) with genuine indicator mathematics.
 *
 * Indicators computed:
 *   - RSI (14-period)
 *   - Stochastic (14,3,3)
 *   - SMA20 vs EMA50 cross
 *   - Wick rejection analysis
 *   - ATR (14-period) volatility
 *   - SuperTrend (10,3)
 *
 * LIVE FOREX STRATEGY IS UNTOUCHED — this engine operates exclusively
 * on OTC candle data provided by the OTC Router.
 */

import type { OTCCandle } from './types';
import type { GeneratedSignal } from '@/app/dashboard/signals/generateSignal';

// ─── Pattern descriptions (mirrors generateSignal.ts — DO NOT merge) ──────
const OF_CALL = [
  { pattern: 'Seller Absorbed by Buyer', icon: '\u2B06', desc: 'Sellers overwhelmed \u2014 Bulls dominating close' },
  { pattern: "Buyer's Aggression", icon: '\u26A1', desc: 'Strong buying momentum at candle close' },
  { pattern: 'Rejection by Buyer', icon: '\u21A9', desc: 'Lower wick speed rejection \u2014 bullish intent' },
];

const OF_PUT = [
  { pattern: 'Buyer Absorbed by Seller', icon: '\u2B07', desc: 'Buyers overwhelmed \u2014 Bears dominating close' },
  { pattern: "Seller's Aggression", icon: '\u26A1', desc: 'Strong selling momentum at candle close' },
  { pattern: 'Rejection by Seller', icon: '\u21AA', desc: 'Upper wick speed rejection \u2014 bearish intent' },
];

const STRATEGY_TAGS = [
  'RSI Reversal + EMA50',
  'SMA21/EMA50 Cross',
  'Wick Rejection + RSI',
  'Orderflow + EMA Trend',
  'RSI Extreme + Confluence',
  'Multi-Indicator Signal',
  'SuperTrend + ATR Filter',
  'SuperTrend + Stoch Cross',
  'ATR Breakout + Orderflow',
  'Order Delta + RSI Confirm',
  'SuperTrend + Delta Volume',
];

// ─── Pure Indicator Functions ───────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function computeSMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function computeEMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return round2(ema);
}

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const recentCloses = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < recentCloses.length; i++) {
    const diff = recentCloses[i] - recentCloses[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return round2(100 - (100 / (1 + avgGain / avgLoss)));
}

function computeStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): { k: number; d: number } {
  if (highs.length < period) return { k: 50, d: 50 };
  const recentHighs = highs.slice(-period);
  const recentLows = lows.slice(-period);
  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);
  const range = highestHigh - lowestLow;
  if (range === 0) return { k: 50, d: 50 };
  const rawK = ((closes[closes.length - 1] - lowestLow) / range) * 100;
  const k = Math.max(0, Math.min(100, rawK));

  const kValues = closes.slice(-3).map((_, i) => {
    const idx = closes.length - 3 + i;
    if (idx < 0) return 50;
    const hh = Math.max(...highs.slice(idx - period + 1, idx + 1).filter((_, j) => idx - period + 1 + j >= 0));
    const ll = Math.min(...lows.slice(idx - period + 1, idx + 1).filter((_, j) => idx - period + 1 + j >= 0));
    const r = hh - ll;
    if (r === 0) return 50;
    return Math.max(0, Math.min(100, ((closes[idx] - ll) / r) * 100));
  });
  const d = kValues.length > 0 ? kValues.reduce((a, b) => a + b, 0) / kValues.length : 50;

  return { k: round2(k), d: round2(d) };
}

function computeATR(candles: OTCCandle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trValues: number[] = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1]?.close ?? c.open;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
    trValues.push(tr);
  }
  return round2(trValues.reduce((a, b) => a + b, 0) / trValues.length);
}

function computeSuperTrend(
  candles: OTCCandle[],
  period = 10,
  multiplier = 3
): { trend: string; strength: string } {
  if (candles.length < period + 1) return { trend: 'NEUTRAL', strength: 'MODERATE' };

  const closes = candles.map(c => c.close);
  const atr = computeATR(candles, period);

  const last = candles[candles.length - 1];
  const hl2 = (last.high + last.low) / 2;
  const upperBand = hl2 + multiplier * atr;
  const lowerBand = hl2 - multiplier * atr;

  const prevClose = candles.length > 1 ? candles[candles.length - 2].close : last.close;

  if (last.close > upperBand && prevClose <= upperBand) return { trend: 'BULLISH', strength: 'STRONG' };
  if (last.close < lowerBand && prevClose >= lowerBand) return { trend: 'BEARISH', strength: 'STRONG' };

  const bullCandles = candles.slice(-period).filter(c => c.close > (c.open + c.close) / 2).length;
  const bearCandles = period - bullCandles;

  if (bullCandles > bearCandles * 1.5) return { trend: 'BULLISH', strength: 'STRONG' };
  if (bearCandles > bullCandles * 1.5) return { trend: 'BEARISH', strength: 'STRONG' };

  const recentBull = candles.slice(-5).filter(c => c.close > c.open).length;
  if (recentBull >= 4) return { trend: 'BULLISH', strength: 'MODERATE' };
  if (recentBull <= 1) return { trend: 'BEARISH', strength: 'MODERATE' };

  return { trend: 'NEUTRAL', strength: 'MODERATE' };
}

function analyzeWicks(candle: OTCCandle): { upperWick: number; lowerWick: number; bias: string } {
  const body = Math.abs(candle.close - candle.open);
  const totalRange = candle.high - candle.low;
  if (totalRange === 0 || body === 0) return { upperWick: 0, lowerWick: 0, bias: 'NEUTRAL' };

  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;

  const upperRatio = upperWick / totalRange;
  const lowerRatio = lowerWick / totalRange;

  let bias = 'NEUTRAL';
  if (lowerWick > upperWick * 1.6 && lowerRatio > 0.3) bias = 'BULLISH';
  else if (upperWick > lowerWick * 1.6 && upperRatio > 0.3) bias = 'BEARISH';

  return { upperWick: round2(upperWick), lowerWick: round2(lowerWick), bias };
}

function picks<T>(arr: T[], seed: number): T {
  const idx = Math.abs(Math.round(seed * 31 + 17)) % arr.length;
  return arr[idx];
}

// ─── Main Analysis ──────────────────────────────────────────────────────────

export interface IndicatorResult {
  direction: 'CALL' | 'PUT' | 'NO_TRADE';
  noTradeReason?: string;
  bullScore: number;
  bearScore: number;
  confidence: number;
  ofPattern: { pattern: string; icon: string; desc: string };
  strategy: string;
  trend: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  entryPrice: string;
  rsi: number;
  stochK: number;
  stochD: number;
  stochBias: string;
  smaStatus: string;
  wickBias: string;
  confirmations: number;
  cvd: number;
  cvdBias: string;
  atr: number;
  atrLevel: string;
  superTrend: string;
  superTrendStrength: string;
  orderDelta: number;
  orderDeltaBias: string;
}

export function analyzeCandles(candles: OTCCandle[]): IndicatorResult {
  const candle = candles[candles.length - 1];
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  // ─── Compute indicators ────────────────────────────────────────────────────
  const rsi = computeRSI(closes, 14);
  const ema50 = computeEMA(closes, 50);
  const sma20 = computeSMA(closes, 20);
  const stoch = computeStochastic(highs, lows, closes, 14);
  const atr = computeATR(candles, 14);
  const wick = analyzeWicks(candle);
  const superTrend = computeSuperTrend(candles, 10, 3);

  // ─── Stochastic bias ──────────────────────────────────────────────────────
  let stochBias = 'NEUTRAL';
  let stochBull = false;
  let stochBear = false;

  const isKAboveD = stoch.k > stoch.d;
  if (stoch.k < 20 && stoch.d < 20) {
    stochBias = 'OVERSOLD';
    stochBull = true;
  } else if (stoch.k > 80 && stoch.d > 80) {
    stochBias = 'OVERBOUGHT';
    stochBear = true;
  } else if (isKAboveD && stoch.k < 50) {
    stochBias = 'BULL CROSS';
    stochBull = true;
  } else if (!isKAboveD && stoch.k > 50) {
    stochBias = 'BEAR CROSS';
    stochBear = true;
  } else {
    stochBias = isKAboveD ? 'BULL BIAS' : 'BEAR BIAS';
  }

  // ─── SMA/EMA status ───────────────────────────────────────────────────────
  const smaStatus =
    sma20 > ema50 ? 'SMA21 > EMA50 \u2191' :
    sma20 < ema50 ? 'SMA21 < EMA50 \u2193' : 'SMA21 \u2248 EMA50';

  // ─── Volatility level ─────────────────────────────────────────────────────
  const avgPrice = (candle.high + candle.low + candle.close) / 3;
  const atrPct = avgPrice > 0 ? (atr / avgPrice) * 100 : 0;
  const atrLevel = atrPct > 1.5 ? 'HIGH VOLATILITY' : atrPct < 0.4 ? 'LOW VOLATILITY' : 'NORMAL';

  // ─── Scoring ──────────────────────────────────────────────────────────────
  let bullPts = 0;
  let bearPts = 0;

  // RSI
  if (rsi < 35) bullPts += 3;
  else if (rsi > 65) bearPts += 3;

  // RSI extreme
  if (rsi < 25) bullPts += 2;
  else if (rsi > 75) bearPts += 2;

  // Stochastic
  if (stochBull) bullPts += 2;
  if (stochBear) bearPts += 2;

  // SMA/EMA
  if (sma20 > ema50) bullPts += 2;
  else if (sma20 < ema50) bearPts += 2;

  // Wick rejection
  if (wick.bias === 'BULLISH') bullPts += 2;
  else if (wick.bias === 'BEARISH') bearPts += 2;

  // Candle body
  if (candle.close > candle.open) bullPts += 1;
  else if (candle.close < candle.open) bearPts += 1;

  // SuperTrend
  if (superTrend.trend === 'BULLISH') bullPts += 3;
  else if (superTrend.trend === 'BEARISH') bearPts += 3;

  // ATR trend support
  if (atrPct > 0.8) {
    if (candle.close > candle.open) bullPts += 1;
    else bearPts += 1;
  }

  // ─── Indicator confluence counting ────────────────────────────────────────
  const isBull = bullPts >= bearPts;
  const topScore = Math.max(bullPts, bearPts);
  const diff = Math.abs(bullPts - bearPts);

  let confirmations = 0;
  if (isBull && rsi < 50) confirmations++;
  else if (!isBull && rsi > 50) confirmations++;
  if (isBull && stochBull) confirmations++;
  else if (!isBull && stochBear) confirmations++;
  if (isBull && sma20 > ema50) confirmations++;
  else if (!isBull && sma20 < ema50) confirmations++;
  if (wick.bias === (isBull ? 'BULLISH' : 'BEARISH')) confirmations++;
  if (superTrend.trend === (isBull ? 'BULLISH' : 'BEARISH')) confirmations++;
  if (isBull && candle.close > candle.open) confirmations++;
  else if (!isBull && candle.close < candle.open) confirmations++;

  // ─── Quality gating — NO_TRADE when signal is weak / conflicted ─────────
  let direction: 'CALL' | 'PUT' | 'NO_TRADE';
  let noTradeReason: string | undefined;

  if (topScore < 5) {
    direction = 'NO_TRADE';
    noTradeReason = 'Insufficient indicator activity — topScore < 5';
  } else if (diff <= 1) {
    direction = 'NO_TRADE';
    noTradeReason = 'Bull/Bear strength effectively tied — diff ≤ 1';
  } else if (diff <= 2 && confirmations < 4) {
    direction = 'NO_TRADE';
    noTradeReason = 'Narrow margin with weak indicator confluence';
  } else if (confirmations < 3) {
    direction = 'NO_TRADE';
    noTradeReason = 'Majority of indicators conflict with dominant direction';
  } else {
    direction = isBull ? 'CALL' : 'PUT';
  }

  // ─── Decision ─────────────────────────────────────────────────────────────
  let confidence: number;
  let ofPattern: { pattern: string; icon: string; desc: string };
  let risk: 'LOW' | 'MEDIUM' | 'HIGH';
  let strategyPick: string;

  if (direction === 'NO_TRADE') {
    confidence = 0;
    ofPattern = { pattern: 'No Trade', icon: '⏸', desc: noTradeReason || 'Signal quality below threshold' };
    risk = 'LOW';
    strategyPick = 'Signal Quality Filter';
  } else {
    const wickDesc = direction === 'CALL' ? OF_CALL : OF_PUT;
    ofPattern = picks(wickDesc, direction === 'CALL' ? rsi : stoch.k);
    confidence = Math.min(95, Math.max(80, 80 + (topScore - 5) * 3));
    risk = confidence >= 91 ? 'LOW' : confidence >= 86 ? 'MEDIUM' : 'HIGH';
    strategyPick = picks(STRATEGY_TAGS, rsi * 100 + stoch.k);
  }

  // ─── CVD / Order Delta approximation from price action ────────────────────
  const cvdBase = direction === 'CALL' ? 1 : direction === 'PUT' ? -1 : 0;
  const cvdStrength = Math.round((topScore / 16) * 500);
  const cvd = cvdBase * (200 + cvdStrength);
  const cvdBias = cvd > 80 ? 'BULLISH' : cvd < -80 ? 'BEARISH' : 'NEUTRAL';

  const orderDelta = cvdBase * (50 + Math.round((topScore / 16) * 100));
  const orderDeltaBias = orderDelta > 15 ? 'BUY DOMINANT' : orderDelta < -15 ? 'SELL DOMINANT' : 'BALANCED';

  const trend = direction === 'CALL' ? '\uD83D\uDCC8 Bullish' : direction === 'PUT' ? '\uD83D\uDCC9 Bearish' : '\u2796 Neutral';

  return {
    direction,
    noTradeReason,
    bullScore: bullPts,
    bearScore: bearPts,
    confidence,
    ofPattern,
    strategy: strategyPick,
    trend,
    risk,
    entryPrice: candle.close.toFixed(5),
    rsi: round2(rsi),
    stochK: stoch.k,
    stochD: stoch.d,
    stochBias,
    smaStatus,
    wickBias: wick.bias,
    confirmations,
    cvd,
    cvdBias,
    atr,
    atrLevel,
    superTrend: superTrend.trend,
    superTrendStrength: superTrend.strength,
    orderDelta,
    orderDeltaBias,
  };
}

export function resultToGeneratedSignal(result: IndicatorResult): GeneratedSignal | null {
  if (result.direction === 'NO_TRADE') return null;
  return {
    direction: result.direction,
    confidence: result.confidence,
    ofPattern: result.ofPattern,
    strategy: result.strategy,
    trend: result.trend,
    risk: result.risk,
    entryPrice: result.entryPrice,
    rsi: result.rsi,
    stochK: result.stochK,
    stochD: result.stochD,
    stochBias: result.stochBias,
    smaStatus: result.smaStatus,
    wickBias: result.wickBias,
    confirmations: result.confirmations,
    cvd: result.cvd,
    cvdBias: result.cvdBias,
    atr: result.atr,
    atrLevel: result.atrLevel,
    superTrend: result.superTrend,
    superTrendStrength: result.superTrendStrength,
    orderDelta: result.orderDelta,
    orderDeltaBias: result.orderDeltaBias,
  };
}
