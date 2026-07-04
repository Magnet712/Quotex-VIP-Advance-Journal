import { CandleCache } from "./CandleCache";

// Indicator helper functions matching v2.0 calculations exactly

export function calculateSMA(prices: number[], period: number): (number | null)[] {
  const sma: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += prices[i - j];
    sma.push(sum / period);
  }
  return Array(period - 1).fill(null).concat(sma);
}

export function calculateEMA(prices: number[], period: number): (number | null)[] {
  const ema: (number | null)[] = [];
  const k = 2 / (period + 1);
  let smaSum = 0;
  for (let i = 0; i < period; i++) smaSum += prices[i];
  let currentEma = smaSum / period;
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      ema.push(null);
    } else if (i === period - 1) {
      ema.push(currentEma);
    } else {
      currentEma = prices[i] * k + currentEma * (1 - (k as number));
      ema.push(currentEma);
    }
  }
  return ema;
}

export function calculateRSI(prices: number[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = Array(prices.length).fill(null);
  if (prices.length <= period) return rsi;
  
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

export function calculateCCI(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const cci: (number | null)[] = Array(closes.length).fill(null);
  if (closes.length < period) return cci;
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  const sma = calculateSMA(tp, period);
  
  for (let i = period - 1; i < closes.length; i++) {
    const slice = tp.slice(i - period + 1, i + 1);
    const currentSma = sma[i];
    if (currentSma === null) continue;
    let meanDev = 0;
    for (let j = 0; j < period; j++) meanDev += Math.abs(slice[j] - currentSma);
    meanDev = meanDev / period;
    cci[i] = meanDev === 0 ? 0 : (tp[i] - currentSma) / (0.015 * meanDev);
  }
  return cci;
}

export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
  kSmooth = 3,
  dSmooth = 3
): { k: (number | null)[]; d: (number | null)[] } {
  const kValues: (number | null)[] = Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - period + 1, i + 1);
    const lowSlice = lows.slice(i - period + 1, i + 1);
    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);
    const denom = highestHigh - lowestLow;
    kValues[i] = denom === 0 ? 50 : ((closes[i] - lowestLow) / denom) * 100;
  }
  
  const mappedK = kValues.map(v => v === null ? 50 : v);
  const smoothK = calculateSMA(mappedK, kSmooth);
  
  const mappedSmoothK = smoothK.map(v => v === null ? 50 : v);
  const smoothD = calculateSMA(mappedSmoothK, dSmooth);
  return { k: smoothK, d: smoothD };
}

export function calculateATR(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const atr: (number | null)[] = Array(closes.length).fill(null);
  if (closes.length < period) return atr;
  const tr = [highs[0] - lows[0]];
  for (let i = 1; i < closes.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  return calculateEMA(tr, period);
}

export function calculateSuperTrend(
  highs: number[],
  lows: number[],
  closes: number[],
  atrPeriod = 10,
  multiplier = 3
): { values: (number | null)[]; trend: number[] } {
  const atr = calculateATR(highs, lows, closes, atrPeriod);
  const supertrend: (number | null)[] = Array(closes.length).fill(null);
  const trend: number[] = Array(closes.length).fill(1);
  
  let prevLowerBand = 0;
  let prevUpperBand = 0;
  let prevTrend = 1;
  
  for (let i = 0; i < closes.length; i++) {
    const currentAtr = atr[i];
    if (i < atrPeriod || currentAtr === null) {
      supertrend[i] = closes[i];
      continue;
    }
    const hl2 = (highs[i] + lows[i]) / 2;
    const basicUpper = hl2 + multiplier * currentAtr;
    const basicLower = hl2 - multiplier * currentAtr;
    
    const finalUpper = (basicUpper < prevUpperBand || closes[i - 1] > prevUpperBand) ? basicUpper : prevUpperBand;
    const finalLower = (basicLower > prevLowerBand || closes[i - 1] < prevLowerBand) ? basicLower : prevLowerBand;
    
    let currentTrend = prevTrend;
    if (closes[i] > finalUpper) {
      currentTrend = 1;
    } else if (closes[i] < finalLower) {
      currentTrend = -1;
    }
    
    supertrend[i] = currentTrend === 1 ? finalLower : finalUpper;
    trend[i] = currentTrend;
    prevLowerBand = finalLower;
    prevUpperBand = finalUpper;
    prevTrend = currentTrend;
  }
  return { values: supertrend, trend };
}

// Strategy Quality Scoring Rules

export function calculateQualityScore(
  direction: "CALL" | "PUT",
  currentPrice: number,
  ema21: (number | null)[],
  sma50: (number | null)[],
  rsi: (number | null)[],
  cci: (number | null)[],
  stoch: { k: (number | null)[]; d: (number | null)[] },
  atr: (number | null)[],
  supertrend: { values: (number | null)[]; trend: number[] },
  idx: number
): number {
  let score = 70; // Base score
  
  const isCall = direction === "CALL";
  
  const currentEma21 = ema21[idx];
  const currentSma50 = sma50[idx];
  if (currentEma21 === null || currentSma50 === null) return score;

  const isBullish = currentEma21 > currentSma50;
  const isBearish = currentEma21 < currentSma50;
  
  if (isCall && isBullish) score += 10;
  if (!isCall && isBearish) score += 10;
  
  const stTrend = supertrend.trend[idx];
  if (isCall && stTrend === 1) score += 10;
  if (!isCall && stTrend === -1) score += 10;
  
  const currentK = stoch.k[idx];
  const currentD = stoch.d[idx];
  const currentRsi = rsi[idx];
  
  if (currentK !== null && currentD !== null && currentRsi !== null) {
    if (isCall) {
      if (currentK > currentD) score += 5;
      if (currentRsi > 30 && currentRsi < 60) score += 5;
    } else {
      if (currentK < currentD) score += 5;
      if (currentRsi < 70 && currentRsi > 40) score += 5;
    }
  }
  
  return Math.min(100, score);
}

// Core Signal Engine Evaluator

export interface ChecklistReason {
  label: string;
  checked: boolean;
  text: string;
}

export interface EngineResult {
  direction: "CALL" | "PUT" | "WAIT";
  confidence: number;
  qualityScore: number;
  strategy: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  recommendation: "CALL" | "PUT" | "WAIT";
  reasons: ChecklistReason[];
  indicators: {
    ema21: number | null;
    sma50: number | null;
    rsi: number | null;
    cci: number | null;
    stochK: number | null;
    stochD: number | null;
    atr: number | null;
    supertrend: number | null;
    supertrendDirection: number;
    bodySize: number;
    upperWick: number;
    lowerWick: number;
  };
}

export function evaluateSignal(pair: string, minQualityScore = 83): EngineResult {
  const history = CandleCache.getCandles(pair);
  
  const resultDefault: EngineResult = {
    direction: "WAIT",
    confidence: 0,
    qualityScore: 0,
    strategy: "No Setup Detected",
    risk: "HIGH",
    recommendation: "WAIT",
    reasons: [],
    indicators: {
      ema21: null,
      sma50: null,
      rsi: null,
      cci: null,
      stochK: null,
      stochD: null,
      atr: null,
      supertrend: null,
      supertrendDirection: 1,
      bodySize: 0,
      upperWick: 0,
      lowerWick: 0
    }
  };

  if (history.length < 52) {
    return resultDefault;
  }

  const closes = history.map(c => c.close);
  const highs = history.map(c => c.high);
  const lows = history.map(c => c.low);

  const ema21 = calculateEMA(closes, 21);
  const sma50 = calculateSMA(closes, 50);
  const rsi = calculateRSI(closes, 14);
  const cci = calculateCCI(highs, lows, closes, 14);
  const stoch = calculateStochastic(highs, lows, closes, 14);
  const atr = calculateATR(highs, lows, closes, 14);
  const supertrend = calculateSuperTrend(highs, lows, closes, 10, 3);

  const idx = closes.length - 1;
  
  const currentEma21 = ema21[idx];
  const currentSma50 = sma50[idx];
  const currentStochK = stoch.k[idx];
  const currentStochD = stoch.d[idx];
  const currentRsi = rsi[idx];
  const currentCci = cci[idx];
  const currentAtr = atr[idx];
  const currentSuperTrend = supertrend.values[idx];
  const currentSuperTrendDir = supertrend.trend[idx];
  const currentPrice = closes[idx];

  const bodySize = Math.abs(closes[idx] - history[idx].open);
  const upperWick = highs[idx] - Math.max(closes[idx], history[idx].open);
  const lowerWick = Math.min(closes[idx], history[idx].open) - lows[idx];

  const indicators = {
    ema21: currentEma21,
    sma50: currentSma50,
    rsi: currentRsi,
    cci: currentCci,
    stochK: currentStochK,
    stochD: currentStochD,
    atr: currentAtr,
    supertrend: currentSuperTrend,
    supertrendDirection: currentSuperTrendDir,
    bodySize,
    upperWick,
    lowerWick
  };

  if (
    currentEma21 === null ||
    currentSma50 === null ||
    currentStochK === null ||
    currentStochD === null ||
    currentRsi === null ||
    currentCci === null ||
    currentAtr === null ||
    currentSuperTrend === null
  ) {
    return resultDefault;
  }

  const isBullishTrend = currentEma21 > currentSma50;
  const isBearishTrend = currentEma21 < currentSma50;

  // Evaluate CALL setup checks
  const isCallStoch = currentStochK > currentStochD && currentStochK < 70;
  const isCallCci = currentCci > 0;
  const isCallSuperTrend = currentSuperTrendDir === 1;
  const isCallWick = lowerWick > upperWick * 1.3;
  const isCallRsi = currentRsi > 30 && currentRsi < 60;
  const isCallAtr = currentAtr > 0.0001; // basic volatility threshold

  // Evaluate PUT setup checks
  const isPutStoch = currentStochK < currentStochD && currentStochK > 30;
  const isPutCci = currentCci < 0;
  const isPutSuperTrend = currentSuperTrendDir === -1;
  const isPutWick = upperWick > lowerWick * 1.3;
  const isPutRsi = currentRsi < 70 && currentRsi > 40;
  const isPutAtr = currentAtr > 0.0001;

  let direction: "CALL" | "PUT" | "WAIT" = "WAIT";
  let reasons: ChecklistReason[] = [];
  let qScore = 70;
  let confidence = 0;
  let strategy = "No Setup Detected";

  if (isBullishTrend && isCallStoch && isCallCci) {
    qScore = calculateQualityScore('CALL', currentPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, idx);
    if (qScore >= minQualityScore) {
      direction = "CALL";
      confidence = 86;
      strategy = "Trend Oscillator Followup";
    }
  } else if (isBearishTrend && isPutStoch && isPutCci) {
    qScore = calculateQualityScore('PUT', currentPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, idx);
    if (qScore >= minQualityScore) {
      direction = "PUT";
      confidence = 85;
      strategy = "Trend Oscillator Followup";
    }
  }

  const isCallSelected = direction === "CALL" || (direction === "WAIT" && isBullishTrend);

  // Generate Confluence Checklist reasons
  reasons = [
    {
      label: "MA Trend Bias",
      checked: isCallSelected ? isBullishTrend : isBearishTrend,
      text: isCallSelected
        ? `EMA21 (${currentEma21.toFixed(5)}) > SMA50 (${currentSma50.toFixed(5)}) ↑`
        : `EMA21 (${currentEma21.toFixed(5)}) < SMA50 (${currentSma50.toFixed(5)}) ↓`
    },
    {
      label: "RSI Momentum Zone",
      checked: isCallSelected ? isCallRsi : isPutRsi,
      text: `RSI is ${currentRsi.toFixed(1)} (${isCallSelected ? "Bullish" : "Bearish"} support check)`
    },
    {
      label: "CCI Bull/Bear Velocity",
      checked: isCallSelected ? isCallCci : isPutCci,
      text: `CCI is ${currentCci.toFixed(1)} (${isCallSelected ? "Positive" : "Negative"} flow)`
    },
    {
      label: "SuperTrend Direction",
      checked: isCallSelected ? isCallSuperTrend : isPutSuperTrend,
      text: `SuperTrend is ${currentSuperTrendDir === 1 ? "BULLISH" : "BEARISH"} (${currentSuperTrend.toFixed(5)})`
    },
    {
      label: "Stochastic Crossover",
      checked: isCallSelected ? isCallStoch : isPutStoch,
      text: `Stochastic %K (${currentStochK.toFixed(1)}) ${isCallSelected ? ">" : "<"} %D (${currentStochD.toFixed(1)})`
    },
    {
      label: "Average True Range",
      checked: isCallSelected ? isCallAtr : isPutAtr,
      text: `ATR volatility is ${currentAtr.toFixed(5)} (${currentAtr > 0.0002 ? "Normal" : "Low"})`
    },
    {
      label: "Candle Wick Confirmation",
      checked: isCallSelected ? isCallWick : isPutWick,
      text: `U-Wick: ${upperWick.toFixed(5)} / L-Wick: ${lowerWick.toFixed(5)} (${isCallSelected ? "Lower" : "Upper"} wick pressure)`
    }
  ];

  const risk = qScore >= 90 ? "LOW" : qScore >= 85 ? "MEDIUM" : "HIGH";
  const recommendation = direction === "CALL" ? "CALL" : direction === "PUT" ? "PUT" : "WAIT";

  return {
    direction,
    confidence: direction === "WAIT" ? 0 : confidence,
    qualityScore: direction === "WAIT" ? 0 : qScore,
    strategy,
    risk,
    recommendation,
    reasons,
    indicators
  };
}
