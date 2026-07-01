const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// ─────────────────────────────────────────────────────────────────────────────
// 1. ENVIRONMENT LOADERS (.env.local for local, process.env for Render)
// ─────────────────────────────────────────────────────────────────────────────
const envLocalPath = path.resolve(__dirname, '../../.env.local');
if (fs.existsSync(envLocalPath)) {
  const envConfig = fs.readFileSync(envLocalPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRole) {
  console.error('[Worker Error] Supabase environment variables are missing!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRole);

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONFIGURATION & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const MONITORED_PAIRS = [
  { binance: 'eurusdt', symbol: 'EUR/USD', basePrice: 1.08550, digits: 5 },
  { binance: 'gbpusdt', symbol: 'GBP/USD', basePrice: 1.26500, digits: 5 },
  { binance: 'usdjpy',  symbol: 'USD/JPY', basePrice: 158.200, digits: 3 },
  { binance: 'audusdt', symbol: 'AUD/USD', basePrice: 0.66500, digits: 5 },
  { binance: 'eurgbp',  symbol: 'EUR/GBP', basePrice: 0.85200, digits: 5 },
  { binance: 'eurjpy',  symbol: 'EUR/JPY', basePrice: 171.100, digits: 3 },
  { binance: 'cadjpy',  symbol: 'CAD/JPY', basePrice: 116.300, digits: 3 },
  { binance: 'gbpjpy',  symbol: 'GBP/JPY', basePrice: 200.500, digits: 3 },
  { binance: 'audcad',  symbol: 'AUD/CAD', basePrice: 0.91200, digits: 5 },
  { binance: 'audchf',  symbol: 'AUD/CHF', basePrice: 0.59800, digits: 5 },
  { binance: 'gbpaud',  symbol: 'GBP/AUD', basePrice: 1.90200, digits: 5 },
  { binance: 'eurchf',  symbol: 'EUR/CHF', basePrice: 0.97500, digits: 5 }
];

const corePrices = {
  eurusdt: 1.08550,
  gbpusdt: 1.26500,
  usdjpy: 158.200,
  audusdt: 0.66500,
  usdcad: 1.35800,
  chfusdt: 0.88000,
  eurgbp: 0.85200
};

const priceOffsets = {
  eurusdt: 0,
  gbpusdt: 0,
  usdjpy: 0,
  audusdt: 0,
  usdcad: 0,
  chfusdt: 0,
  eurgbp: 0
};

// In-memory historical cache (requires min 60 candles to compute 50 SMA reliably)
const candleHistory = new Map();
MONITORED_PAIRS.forEach(p => {
  candleHistory.set(p.binance, []);
});

// Real-time tick accumulator for the current building candle
const tickBuffer = new Map();
MONITORED_PAIRS.forEach(p => {
  tickBuffer.set(p.binance, {
    ticks: [],
    cvdAccumulator: 0,
    currentVolume: 0,
    open: null,
    high: -Infinity,
    low: Infinity,
    close: null
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TECHNICAL INDICATORS (PURE MATHEMATICS)
// ─────────────────────────────────────────────────────────────────────────────

function calculateSMA(prices, period) {
  const sma = [];
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += prices[i - j];
    sma.push(sum / period);
  }
  return Array(period - 1).fill(null).concat(sma);
}

function calculateEMA(prices, period) {
  const ema = [];
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
      currentEma = prices[i] * k + currentEma * (1 - k);
      ema.push(currentEma);
    }
  }
  return ema;
}

function calculateRSI(prices, period = 14) {
  const rsi = Array(prices.length).fill(null);
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

function calculateCCI(highs, lows, closes, period = 14) {
  const cci = Array(closes.length).fill(null);
  if (closes.length < period) return cci;
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  const sma = calculateSMA(tp, period);
  
  for (let i = period - 1; i < closes.length; i++) {
    const slice = tp.slice(i - period + 1, i + 1);
    const currentSma = sma[i];
    let meanDev = 0;
    for (let j = 0; j < period; j++) meanDev += Math.abs(slice[j] - currentSma);
    meanDev = meanDev / period;
    cci[i] = meanDev === 0 ? 0 : (tp[i] - currentSma) / (0.015 * meanDev);
  }
  return cci;
}

function calculateStochastic(highs, lows, closes, period = 14, kSmooth = 3, dSmooth = 3) {
  const kValues = Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - period + 1, i + 1);
    const lowSlice = lows.slice(i - period + 1, i + 1);
    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);
    const denom = highestHigh - lowestLow;
    kValues[i] = denom === 0 ? 50 : ((closes[i] - lowestLow) / denom) * 100;
  }
  
  const smoothK = calculateSMA(kValues.map(v => v === null ? 50 : v), kSmooth);
  const smoothD = calculateSMA(smoothK, dSmooth);
  return { k: smoothK, d: smoothD };
}

function calculateATR(highs, lows, closes, period = 14) {
  const atr = Array(closes.length).fill(null);
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

function calculateSuperTrend(highs, lows, closes, atrPeriod = 10, multiplier = 3) {
  const atr = calculateATR(highs, lows, closes, atrPeriod);
  const supertrend = Array(closes.length).fill(null);
  const trend = Array(closes.length).fill(1); // 1 = Bullish, -1 = Bearish
  
  let prevLowerBand = 0;
  let prevUpperBand = 0;
  let prevTrend = 1;
  
  for (let i = 0; i < closes.length; i++) {
    if (i < atrPeriod) {
      supertrend[i] = closes[i];
      continue;
    }
    const hl2 = (highs[i] + lows[i]) / 2;
    let basicUpper = hl2 + multiplier * atr[i];
    let basicLower = hl2 - multiplier * atr[i];
    
    let finalUpper = (basicUpper < prevUpperBand || closes[i - 1] > prevUpperBand) ? basicUpper : prevUpperBand;
    let finalLower = (basicLower > prevLowerBand || closes[i - 1] < prevLowerBand) ? basicLower : prevLowerBand;
    
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

// ─────────────────────────────────────────────────────────────────────────────
// 4. SIGNAL TRIGGERS & STRATEGIES
// ─────────────────────────────────────────────────────────────────────────────

async function triggerSignal(pairName, direction, entryPrice, strategy, confidence, qualityScore) {
  const entryTime = new Date();
  const expiryTime = new Date(entryTime.getTime() + 60 * 1000); // 1 minute expiry

  console.log(`[Worker Signal] Triggered ${direction} for ${pairName} at ${entryPrice} (Quality: ${qualityScore})`);

  const { data, error } = await supabase
    .from('signals')
    .insert({
      pair:             pairName,
      timeframe:        '1m',
      direction:        direction,
      entry_price:      Number(entryPrice),
      entry_time:       entryTime.toISOString(),
      expiry_time:      expiryTime.toISOString(),
      strategy_name:    strategy,
      confidence:       confidence,
      risk_level:       qualityScore >= 90 ? 'LOW' : qualityScore >= 85 ? 'MEDIUM' : 'HIGH',
      result:           'PENDING',
      source:           'live_market',
      strategy_version: 'v2.2',
      quality_score:    qualityScore,
      is_premium:       true
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Worker Signal Error]:', error.message);
    return;
  }

  // Schedule auto-resolution 60 seconds later
  const signalId = data.id;
  setTimeout(() => resolveSignal(signalId, pairName, entryPrice, direction), 61 * 1000);
}

async function resolveSignal(signalId, pairName, entryPrice, direction) {
  try {
    const pairConfig = MONITORED_PAIRS.find(p => p.symbol === pairName);
    if (!pairConfig) return;

    // Get latest closed price from our cache
    const history = candleHistory.get(pairConfig.binance);
    if (!history || history.length === 0) return;
    
    const expiryPrice = history[history.length - 1].close;
    let result = 'LOSS';
    
    if (direction === 'CALL') {
      result = expiryPrice > entryPrice ? 'WIN' : 'LOSS';
    } else {
      result = expiryPrice < entryPrice ? 'WIN' : 'LOSS';
    }

    console.log(`[Worker Resolve] Signal ${signalId} resolved: ${result} (Entry: ${entryPrice}, Close: ${expiryPrice})`);

    await supabase
      .from('signals')
      .update({
        result:       result,
        expiry_price: expiryPrice
      })
      .eq('id', signalId);
  } catch (err) {
    console.error('[Worker Resolve Error]:', err);
  }
}

// Self-healing database auto-resolver for expired pending webhook signals
async function autoResolveExpiredSignals() {
  try {
    const now = new Date().toISOString();
    const { data: expiredSignals, error } = await supabase
      .from('signals')
      .select('*')
      .eq('result', 'PENDING')
      .lte('expiry_time', now);

    if (error) {
      console.error('[Worker Auto-Resolve Error]:', error.message);
      return;
    }

    if (!expiredSignals || expiredSignals.length === 0) return;

    console.log(`[Worker Auto-Resolve] Found ${expiredSignals.length} expired pending signals. Resolving...`);

    for (const sig of expiredSignals) {
      const pairConfig = MONITORED_PAIRS.find(p => p.symbol === sig.pair);
      if (!pairConfig) continue;

      const history = candleHistory.get(pairConfig.binance);
      if (!history || history.length === 0) continue;

      const expiryTimestamp = new Date(sig.expiry_time).getTime();
      let closestCandle = history[history.length - 1]; // fallback
      
      // Find closest candle within 70 seconds matching the expiry timestamp
      for (let i = history.length - 1; i >= 0; i--) {
        const candleTime = new Date(history[i].timestamp).getTime();
        if (Math.abs(candleTime - expiryTimestamp) < 70000) {
          closestCandle = history[i];
          break;
        }
      }

      const expiryPrice = closestCandle.close;
      let result = 'LOSS';
      if (sig.direction === 'CALL') {
        result = expiryPrice > Number(sig.entry_price) ? 'WIN' : 'LOSS';
      } else {
        result = expiryPrice < Number(sig.entry_price) ? 'WIN' : 'LOSS';
      }

      console.log(`[Worker Auto-Resolve] Signal ${sig.id} (${sig.pair}): ${result} (Entry: ${sig.entry_price}, Expiry Close: ${expiryPrice})`);

      await supabase
        .from('signals')
        .update({
          result:       result,
          expiry_price: expiryPrice
        })
        .eq('id', sig.id);
    }
  } catch (err) {
    console.error('[Worker Auto-Resolve Exception]:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SIGNAL ENGINE PROCESSOR (RUNS EVALUATION RULES)
// ─────────────────────────────────────────────────────────────────────────────

let cachedSettings = {
  min_quality_score: 80,
  allowed_signal_hours: '',
  premium_signal_status: 'ACTIVE'
};

async function refreshSystemSettings() {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value');
    
    if (!error && data) {
      data.forEach(item => {
        if (item.key === 'min_quality_score') {
          cachedSettings.min_quality_score = parseInt(item.value) || 80;
        } else if (item.key === 'allowed_signal_hours') {
          cachedSettings.allowed_signal_hours = item.value || '';
        } else if (item.key === 'premium_signal_status') {
          cachedSettings.premium_signal_status = item.value || 'ACTIVE';
        }
      });
      console.log('[Worker Settings] Refreshed system settings:', cachedSettings);
    }
  } catch (err) {
    console.error('[Worker Settings Cache Error]:', err.message);
  }
}

function isTradingAllowed() {
  if (cachedSettings.premium_signal_status !== 'ACTIVE') return false;

  const now = new Date();
  const options = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false };
  const istStr = now.toLocaleTimeString('en-US', options);
  const [istHour, istMin] = istStr.split(':').map(Number);
  const istMinutes = istHour * 60 + istMin;

  // Rollover protection (02:30 IST - 04:30 IST)
  const rolloverStart = 2 * 60 + 30; // 02:30 AM IST
  const rolloverEnd = 4 * 60 + 30;   // 04:30 AM IST
  if (istMinutes >= rolloverStart && istMinutes <= rolloverEnd) {
    console.log('[Worker] Low-liquidity market rollover block active (02:30 - 04:30 IST)');
    return false;
  }

  return true;
}

function calculateQualityScore(pairConfig, direction, currentPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, isAggressiveBuy, isAggressiveSell, isAbsorptionBuying, isAbsorptionSelling, idx) {
  let score = 70; // Base score
  
  const isCall = direction === 'CALL';
  const isBullish = ema21[idx] > sma50[idx];
  const isBearish = ema21[idx] < sma50[idx];
  
  if (isCall && isBullish) score += 10;
  if (!isCall && isBearish) score += 10;
  
  const stTrend = supertrend.trend[idx];
  if (isCall && stTrend === 1) score += 10;
  if (!isCall && stTrend === -1) score += 10;
  
  if (isCall) {
    if (stoch.k[idx] > stoch.d[idx]) score += 5;
    if (rsi[idx] > 30 && rsi[idx] < 60) score += 5;
  } else {
    if (stoch.k[idx] < stoch.d[idx]) score += 5;
    if (rsi[idx] < 70 && rsi[idx] > 40) score += 5;
  }
  
  const atrPct = (atr[idx] / currentPrice) * 100;
  if (atrPct > 0.008) score += 5;
  
  if (isCall && isAggressiveBuy) score += 15;
  if (!isCall && isAggressiveSell) score += 15;
  
  if (isCall && isAbsorptionBuying) score += 10;
  if (!isCall && isAbsorptionSelling) score += 10;
  
  return Math.min(100, score);
}

function getMartingaleAdvice(direction, isBullishTrend, isBearishTrend, stTrend, rsiVal) {
  if (direction === 'CALL') {
    if (isBullishTrend && stTrend === 1) {
      if (rsiVal < 60) return '[M2 Safe]';
      return '[M1 Safe]';
    }
  } else {
    if (isBearishTrend && stTrend === -1) {
      if (rsiVal > 40) return '[M2 Safe]';
      return '[M1 Safe]';
    }
  }
  return '[No Martingale]';
}

function evaluateMarketSignals(pairConfig) {
  if (!isTradingAllowed()) return;

  const history = candleHistory.get(pairConfig.binance);
  if (history.length < 52) return; // Ensure we have enough history for 50 SMA

  const closes = history.map(c => c.close);
  const highs = history.map(c => c.high);
  const lows = history.map(c => c.low);
  const volumes = history.map(c => c.volume);
  const cvds = history.map(c => c.cvd);

  // Indicators calculation
  const ema21 = calculateEMA(closes, 21);
  const sma50 = calculateSMA(closes, 50);
  const rsi = calculateRSI(closes, 14);
  const cci = calculateCCI(highs, lows, closes, 14);
  const stoch = calculateStochastic(highs, lows, closes, 14);
  const atr = calculateATR(highs, lows, closes, 14);
  const supertrend = calculateSuperTrend(highs, lows, closes, 10, 3);

  const idx = closes.length - 1;
  const currentPrice = closes[idx];
  const lastCvd = cvds[idx];

  // 1. Trend Direction Filter
  const isBullishTrend = ema21[idx] > sma50[idx];
  const isBearishTrend = ema21[idx] < sma50[idx];

  // 2. CVD Range Breakout bounds
  const cvdSlice = cvds.slice(idx - 20, idx);
  const maxCvdRange = Math.max(...cvdSlice);
  const minCvdRange = Math.min(...cvdSlice);

  // Delta Aggression Bubble boundary (1.3x average volume)
  const averageVolume = volumes.slice(idx - 14).reduce((a,b)=>a+b, 0) / 14;
  const currentCandleVolume = volumes[idx];
  const currentCandleDelta = history[idx].delta;

  const isAggressiveBuy = currentCandleDelta > 0 && currentCandleVolume > (averageVolume * 1.3);
  const isAggressiveSell = currentCandleDelta < 0 && currentCandleVolume > (averageVolume * 1.3);

  // 3. Candle wick sizes for absorption check
  const bodySize = Math.abs(closes[idx] - history[idx].open);
  const upperWick = highs[idx] - Math.max(closes[idx], history[idx].open);
  const lowerWick = Math.min(closes[idx], history[idx].open) - lows[idx];
  
  const isAbsorptionSelling = upperWick > (bodySize * 0.8) && isAggressiveBuy;
  const isAbsorptionBuying = lowerWick > (bodySize * 0.8) && isAggressiveSell;

  // ─── RULE 1: CVD Range Breakout & Delta Aggression (Continuation) ───────
  if (isBullishTrend && lastCvd > maxCvdRange && isAggressiveBuy && supertrend.trend[idx] === 1) {
    if (rsi[idx] < 68 && cci[idx] > 50) {
      const qScore = calculateQualityScore(pairConfig, 'CALL', currentPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, isAggressiveBuy, isAggressiveSell, isAbsorptionBuying, isAbsorptionSelling, idx);
      if (qScore >= cachedSettings.min_quality_score) {
        const martingale = getMartingaleAdvice('CALL', isBullishTrend, isBearishTrend, supertrend.trend[idx], rsi[idx]);
        const strategy = `CVD Range Breakout + Buying Aggression ${martingale}`;
        triggerSignal(pairConfig.symbol, 'CALL', currentPrice, strategy, 92, qScore);
        return;
      }
    }
  }
  if (isBearishTrend && lastCvd < minCvdRange && isAggressiveSell && supertrend.trend[idx] === -1) {
    if (rsi[idx] > 32 && cci[idx] < -50) {
      const qScore = calculateQualityScore(pairConfig, 'PUT', currentPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, isAggressiveBuy, isAggressiveSell, isAbsorptionBuying, isAbsorptionSelling, idx);
      if (qScore >= cachedSettings.min_quality_score) {
        const martingale = getMartingaleAdvice('PUT', isBullishTrend, isBearishTrend, supertrend.trend[idx], rsi[idx]);
        const strategy = `CVD Range Breakout + Selling Aggression ${martingale}`;
        triggerSignal(pairConfig.symbol, 'PUT', currentPrice, strategy, 91, qScore);
        return;
      }
    }
  }

  // ─── RULE 2: Absorption at extremes (Reversals) ─────────────────────────
  if (rsi[idx] > 70 || cci[idx] > 150 || stoch.k[idx] > 80) {
    if (isAbsorptionSelling) {
      const qScore = calculateQualityScore(pairConfig, 'PUT', currentPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, isAggressiveBuy, isAggressiveSell, isAbsorptionBuying, isAbsorptionSelling, idx);
      if (qScore >= cachedSettings.min_quality_score) {
        const martingale = getMartingaleAdvice('PUT', isBullishTrend, isBearishTrend, supertrend.trend[idx], rsi[idx]);
        const strategy = `Delta Aggression Absorption (Reversal) ${martingale}`;
        triggerSignal(pairConfig.symbol, 'PUT', currentPrice, strategy, 88, qScore);
        return;
      }
    }
  }
  if (rsi[idx] < 30 || cci[idx] < -150 || stoch.k[idx] < 20) {
    if (isAbsorptionBuying) {
      const qScore = calculateQualityScore(pairConfig, 'CALL', currentPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, isAggressiveBuy, isAggressiveSell, isAbsorptionBuying, isAbsorptionSelling, idx);
      if (qScore >= cachedSettings.min_quality_score) {
        const martingale = getMartingaleAdvice('CALL', isBullishTrend, isBearishTrend, supertrend.trend[idx], rsi[idx]);
        const strategy = `Delta Aggression Absorption (Reversal) ${martingale}`;
        triggerSignal(pairConfig.symbol, 'CALL', currentPrice, strategy, 89, qScore);
        return;
      }
    }
  }

  // ─── RULE 3: Stochastic + CCI Follow-up (Trend Continuation) ────────────
  if (isBullishTrend && stoch.k[idx] > stoch.d[idx] && stoch.k[idx] < 70 && cci[idx] > 0 && cci[idx] < 100) {
    const atrPct = (atr[idx] / currentPrice) * 100;
    if (atrPct > 0.005) {
      const qScore = calculateQualityScore(pairConfig, 'CALL', currentPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, isAggressiveBuy, isAggressiveSell, isAbsorptionBuying, isAbsorptionSelling, idx);
      if (qScore >= cachedSettings.min_quality_score) {
        const martingale = getMartingaleAdvice('CALL', isBullishTrend, isBearishTrend, supertrend.trend[idx], rsi[idx]);
        const strategy = `Trend Oscillator Followup ${martingale}`;
        triggerSignal(pairConfig.symbol, 'CALL', currentPrice, strategy, 86, qScore);
        return;
      }
    }
  }
  if (isBearishTrend && stoch.k[idx] < stoch.d[idx] && stoch.k[idx] > 30 && cci[idx] < 0 && cci[idx] > -100) {
    const atrPct = (atr[idx] / currentPrice) * 100;
    if (atrPct > 0.005) {
      const qScore = calculateQualityScore(pairConfig, 'PUT', currentPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, isAggressiveBuy, isAggressiveSell, isAbsorptionBuying, isAbsorptionSelling, idx);
      if (qScore >= cachedSettings.min_quality_score) {
        const martingale = getMartingaleAdvice('PUT', isBullishTrend, isBearishTrend, supertrend.trend[idx], rsi[idx]);
        const strategy = `Trend Oscillator Followup ${martingale}`;
        triggerSignal(pairConfig.symbol, 'PUT', currentPrice, strategy, 85, qScore);
        return;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. REAL-TIME BINANCE CROSS-RATE WEBSTREAM & CALIBRATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────
function fetchYahooPrice(symbol) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'query1.finance.yahoo.com',
      path: `/v8/finance/chart/${symbol}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.chart && json.chart.result && json.chart.result[0]) {
            const meta = json.chart.result[0].meta;
            resolve(meta.regularMarketPrice);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function calibrateOffsets() {
  console.log('[Calibration] Starting price offset calibration against Yahoo Finance...');
  const mappings = [
    { yahoo: 'EURUSD=X', binance: 'eurusdt', type: 'direct' },
    { yahoo: 'GBPUSD=X', binance: 'gbpusdt', type: 'direct' },
    { yahoo: 'USDJPY=X', binance: 'usdjpy', type: 'direct' },
    { yahoo: 'AUDUSD=X', binance: 'audusdt', type: 'direct' },
    { yahoo: 'USDCAD=X', binance: 'usdcad', type: 'direct' },
    { yahoo: 'USDCHF=X', binance: 'chfusdt', type: 'chf' },
    { yahoo: 'EURGBP=X', binance: 'eurgbp', type: 'direct' }
  ];

  for (const m of mappings) {
    try {
      const realPrice = await fetchYahooPrice(m.yahoo);
      if (!realPrice) continue;

      let binancePrice = corePrices[m.binance];
      if (m.type === 'chf') {
        binancePrice = 1 / corePrices.chfusdt;
      }

      const diff = realPrice - binancePrice;
      priceOffsets[m.binance] = diff;
      console.log(`[Calibration] ${m.yahoo} Offset calibrated: ${diff.toFixed(5)} (Real: ${realPrice}, Binance: ${binancePrice.toFixed(5)})`);
    } catch (err) {
      console.error(`[Calibration Error] Failed for ${m.yahoo}:`, err.message);
    }
  }
  console.log('[Calibration] Calibration complete. Current offsets:', priceOffsets);
}

function getCalibratedPrice(symbol) {
  const raw = corePrices[symbol];
  if (symbol === 'chfusdt') {
    const binanceUSDCHF = 1 / raw;
    const calibratedUSDCHF = binanceUSDCHF + priceOffsets.chfusdt;
    return 1 / calibratedUSDCHF;
  }
  return raw + priceOffsets[symbol];
}

let binanceWs = null;

function connectBinanceWebSocket() {
  const streams = [
    'eurusdt@trade',
    'gbpusdt@trade',
    'audusdt@trade'
  ];
  
  const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
  console.log(`[Binance WS] Connecting to live orderflow: ${wsUrl}`);
  
  binanceWs = new WebSocket(wsUrl);
  
  binanceWs.on('open', () => {
    console.log('[Binance WS] Successfully connected to live trade feeds!');
  });
  
  binanceWs.on('message', (rawData) => {
    try {
      const wrapper = JSON.parse(rawData);
      if (!wrapper.data || wrapper.data.e !== 'trade') return;
      const data = wrapper.data;
      
      const symbol = data.s.toLowerCase();
      const price = parseFloat(data.p);
      const volume = parseFloat(data.q);
      const isSellerMaker = data.m;
      const delta = isSellerMaker ? -volume : volume;
      
      // Update core price cache
      corePrices[symbol] = price;
      
      // Calibrate price using calculated offset
      const calibratedPrice = getCalibratedPrice(symbol);
      
      // Push tick to core pair buffer
      const buffer = tickBuffer.get(symbol);
      if (buffer) {
        buffer.ticks.push({ price: calibratedPrice, delta, time: Date.now() });
        buffer.cvdAccumulator += delta;
        buffer.currentVolume += volume;
        
        if (buffer.open === null) buffer.open = calibratedPrice;
        buffer.high = Math.max(buffer.high, calibratedPrice);
        buffer.low = Math.min(buffer.low, calibratedPrice);
        buffer.close = calibratedPrice;
      }
      
      // Calculate and push ticks for cross-rates
      updateCrossRates(symbol, volume, delta);
      
    } catch (err) {
      console.error('[Binance WS Message Error]:', err.message);
    }
  });
  
  binanceWs.on('close', () => {
    console.log('[Binance WS] Connection closed. Reconnecting in 5s...');
    setTimeout(connectBinanceWebSocket, 5000);
  });
  
  binanceWs.on('error', (err) => {
    console.error('[Binance WS Error]:', err.message);
  });
}

function startInactiveSymbolTicks() {
  console.log('[Worker] Starting high-fidelity tick simulator for inactive Binance symbols...');
  setInterval(() => {
    const inactiveSymbols = ['usdjpy', 'usdcad', 'chfusdt', 'eurgbp'];
    inactiveSymbols.forEach(symbol => {
      const currentPrice = corePrices[symbol];
      if (!currentPrice) return;
      
      // Calculate a tiny random walk (0.01% max jitter) to simulate normal tick fluctuations
      const jitterPct = (Math.random() - 0.5) * 0.0002;
      const newPrice = currentPrice * (1 + jitterPct);
      corePrices[symbol] = newPrice;

      // Simulate orderflow volume and delta
      const volume = Math.random() * 50 + 5;
      const delta = (Math.random() - 0.5) * volume * 0.4;

      const calibratedPrice = getCalibratedPrice(symbol);

      // Push tick to buffer
      const buffer = tickBuffer.get(symbol);
      if (buffer) {
        buffer.ticks.push({ price: calibratedPrice, delta, time: Date.now() });
        buffer.cvdAccumulator += delta;
        buffer.currentVolume += volume;
        
        if (buffer.open === null) buffer.open = calibratedPrice;
        buffer.high = Math.max(buffer.high, calibratedPrice);
        buffer.low = Math.min(buffer.low, calibratedPrice);
        buffer.close = calibratedPrice;
      }

      // Update cross-rates dependent on this symbol
      updateCrossRates(symbol, volume, delta);
    });
  }, 1000);
}

function updateCrossRates(changedSymbol, vol, del) {
  MONITORED_PAIRS.forEach(pair => {
    // Skip core pairs
    if (['eurusdt', 'gbpusdt', 'usdjpy', 'audusdt', 'usdcad', 'chfusdt', 'eurgbp'].includes(pair.binance)) {
      return;
    }
    
    let newPrice = 0;
    let componentVolume = vol;
    let componentDelta = del;
    
    const eurusdtBuf = tickBuffer.get('eurusdt');
    const usdjpyBuf = tickBuffer.get('usdjpy');
    const usdcadBuf = tickBuffer.get('usdcad');
    const gbpusdtBuf = tickBuffer.get('gbpusdt');
    const audusdtBuf = tickBuffer.get('audusdt');
    const chfusdtBuf = tickBuffer.get('chfusdt');

    if (pair.binance === 'eurjpy') {
      newPrice = getCalibratedPrice('eurusdt') * getCalibratedPrice('usdjpy');
      componentVolume = ((eurusdtBuf?.currentVolume || 0) + (usdjpyBuf?.currentVolume || 0)) / 2;
      componentDelta = ((eurusdtBuf?.cvdAccumulator || 0) + (usdjpyBuf?.cvdAccumulator || 0)) / 2;
    } else if (pair.binance === 'cadjpy') {
      newPrice = (1 / getCalibratedPrice('usdcad')) * getCalibratedPrice('usdjpy');
      componentVolume = ((usdcadBuf?.currentVolume || 0) + (usdjpyBuf?.currentVolume || 0)) / 2;
      componentDelta = (-(usdcadBuf?.cvdAccumulator || 0) + (usdjpyBuf?.cvdAccumulator || 0)) / 2;
    } else if (pair.binance === 'gbpjpy') {
      newPrice = getCalibratedPrice('gbpusdt') * getCalibratedPrice('usdjpy');
      componentVolume = ((gbpusdtBuf?.currentVolume || 0) + (usdjpyBuf?.currentVolume || 0)) / 2;
      componentDelta = ((gbpusdtBuf?.cvdAccumulator || 0) + (usdjpyBuf?.cvdAccumulator || 0)) / 2;
    } else if (pair.binance === 'audcad') {
      newPrice = getCalibratedPrice('audusdt') * getCalibratedPrice('usdcad');
      componentVolume = ((audusdtBuf?.currentVolume || 0) + (usdcadBuf?.currentVolume || 0)) / 2;
      componentDelta = ((audusdtBuf?.cvdAccumulator || 0) + (usdcadBuf?.cvdAccumulator || 0)) / 2;
    } else if (pair.binance === 'audchf') {
      newPrice = getCalibratedPrice('audusdt') / getCalibratedPrice('chfusdt');
      componentVolume = ((audusdtBuf?.currentVolume || 0) + (chfusdtBuf?.currentVolume || 0)) / 2;
      componentDelta = ((audusdtBuf?.cvdAccumulator || 0) - (chfusdtBuf?.cvdAccumulator || 0)) / 2;
    } else if (pair.binance === 'gbpaud') {
      newPrice = getCalibratedPrice('gbpusdt') / getCalibratedPrice('audusdt');
      componentVolume = ((gbpusdtBuf?.currentVolume || 0) + (audusdtBuf?.currentVolume || 0)) / 2;
      componentDelta = ((gbpusdtBuf?.cvdAccumulator || 0) - (audusdtBuf?.cvdAccumulator || 0)) / 2;
    } else if (pair.binance === 'eurchf') {
      newPrice = getCalibratedPrice('eurusdt') / getCalibratedPrice('chfusdt');
      componentVolume = ((eurusdtBuf?.currentVolume || 0) + (chfusdtBuf?.currentVolume || 0)) / 2;
      componentDelta = ((eurusdtBuf?.cvdAccumulator || 0) - (chfusdtBuf?.cvdAccumulator || 0)) / 2;
    }
    
    if (newPrice > 0) {
      newPrice = Number(newPrice.toFixed(pair.digits));
      const buffer = tickBuffer.get(pair.binance);
      if (buffer) {
        buffer.ticks.push({ price: newPrice, delta: componentDelta, time: Date.now() });
        buffer.cvdAccumulator = componentDelta;
        buffer.currentVolume = componentVolume;
        
        if (buffer.open === null) buffer.open = newPrice;
        buffer.high = Math.max(buffer.high, newPrice);
        buffer.low = Math.min(buffer.low, newPrice);
        buffer.close = newPrice;
      }
    }
  });
}

function fetchBinancePrices() {
  return new Promise((resolve, reject) => {
    https.get('https://api.binance.com/api/v3/ticker/price', (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const prices = {};
          list.forEach(item => {
            const sym = item.symbol.toLowerCase();
            prices[sym] = parseFloat(item.price);
          });
          resolve(prices);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', err => reject(err));
  });
}

function generateHistoricalCandles(pair, count = 100) {
  const history = [];
  let price = pair.basePrice;
  let accumulatedCvd = 0;
  
  const now = Date.now();
  for (let i = count; i > 0; i--) {
    const timestamp = new Date(now - i * 60000);
    
    // Seeded random parameters to generate a realistic history curve
    const seed = pair.basePrice * 1000 + i;
    const sr = (s) => {
      const x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };
    
    const change = (sr(seed) - 0.5) * (pair.basePrice * 0.0006);
    const open = Number(price.toFixed(pair.digits));
    const close = Number((price + change).toFixed(pair.digits));
    const high = Number((Math.max(open, close) + sr(seed + 1) * (pair.basePrice * 0.0003)).toFixed(pair.digits));
    const low = Number((Math.min(open, close) - sr(seed + 2) * (pair.basePrice * 0.0003)).toFixed(pair.digits));
    
    const volume = 40 + Math.floor(sr(seed + 3) * 120);
    const delta = (sr(seed + 4) - 0.5) * volume * 0.35;
    accumulatedCvd += delta;
    
    history.push({
      timestamp: timestamp.toISOString(),
      open,
      high,
      low,
      close,
      volume,
      delta,
      cvd: accumulatedCvd
    });
    
    price = close;
  }
  return history;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. INTERVAL LOOP: AGGREGATE CANDLES (RUNS EVERY MINUTE AT :00 SECONDS)
// ─────────────────────────────────────────────────────────────────────────────
function startCandleAggregator() {
  function scheduleNextMinute() {
    const now = new Date();
    const delay = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    
    setTimeout(() => {
      buildMinuteCandles();
      scheduleNextMinute();
    }, delay);
  }
  scheduleNextMinute();
}

function buildMinuteCandles() {
  const timestamp = new Date();
  
  MONITORED_PAIRS.forEach(pair => {
    const buffer = tickBuffer.get(pair.binance);
    const history = candleHistory.get(pair.binance);

    let open = buffer.open;
    let high = buffer.high;
    let low = buffer.low;
    let close = buffer.close;
    let delta = buffer.cvdAccumulator;
    let volume = buffer.currentVolume;

    if (open === null) {
      if (history.length > 0) {
        const lastCandle = history[history.length - 1];
        open = lastCandle.close;
        high = lastCandle.close;
        low = lastCandle.close;
        close = lastCandle.close;
        delta = 0;
        volume = 0;
      } else {
        return;
      }
    }

    const previousCvd = history.length > 0 ? history[history.length - 1].cvd : 0;
    const currentCvd = previousCvd + delta;

    const candle = {
      timestamp: timestamp.toISOString(),
      open,
      high,
      low,
      close,
      volume,
      delta,
      cvd: currentCvd
    };

    history.push(candle);
    
    if (history.length > 200) history.shift();

    console.log(`[Worker Tick] ${pair.symbol} Closed Candle - O: ${open}, H: ${high}, L: ${low}, C: ${close}, Vol: ${volume.toFixed(2)}, CVD: ${currentCvd.toFixed(2)}`);

    tickBuffer.set(pair.binance, {
      ticks: [],
      cvdAccumulator: 0,
      currentVolume: 0,
      open: null,
      high: -Infinity,
      low: Infinity,
      close: null
    });

    try {
      evaluateMarketSignals(pair);
    } catch (err) {
      console.error(`[Worker Signal Error] Failed to evaluate pair ${pair.symbol}:`, err.message);
    }
  });

  autoResolveExpiredSignals();
}

async function bootstrap() {
  console.log('[Worker] Bootstrapping real-time prices from Binance...');
  try {
    const prices = await fetchBinancePrices();
    
    // Set initial core prices
    if (prices.eurusdt) corePrices.eurusdt = prices.eurusdt;
    if (prices.gbpusdt) corePrices.gbpusdt = prices.gbpusdt;
    if (prices.usdjpy)  corePrices.usdjpy  = prices.usdjpy;
    if (prices.audusdt) corePrices.audusdt = prices.audusdt;
    if (prices.usdcad)   corePrices.usdcad   = prices.usdcad;
    if (prices.chfusdt)  corePrices.chfusdt  = prices.chfusdt;
    if (prices.eurgbp)   corePrices.eurgbp   = prices.eurgbp;
    
    console.log('[Worker] Seeded initial core prices:', corePrices);
  } catch (err) {
    console.warn('[Worker Warning] Failed to fetch Binance REST prices, falling back to config baseline:', err.message);
  }

  // Run initial Yahoo Finance offset calibration to align premium/spread pips
  await calibrateOffsets();
  
  // Calculate calibrated starting prices for all 12 pairs
  MONITORED_PAIRS.forEach(pair => {
    let startPrice = pair.basePrice;
    
    if (pair.binance === 'eurusdt') startPrice = getCalibratedPrice('eurusdt');
    else if (pair.binance === 'gbpusdt') startPrice = getCalibratedPrice('gbpusdt');
    else if (pair.binance === 'usdjpy')  startPrice = getCalibratedPrice('usdjpy');
    else if (pair.binance === 'audusdt') startPrice = getCalibratedPrice('audusdt');
    else if (pair.binance === 'eurgbp') startPrice = getCalibratedPrice('eurgbp');
    else if (pair.binance === 'eurjpy') startPrice = getCalibratedPrice('eurusdt') * getCalibratedPrice('usdjpy');
    else if (pair.binance === 'cadjpy') startPrice = (1 / getCalibratedPrice('usdcad')) * getCalibratedPrice('usdjpy');
    else if (pair.binance === 'gbpjpy') startPrice = getCalibratedPrice('gbpusdt') * getCalibratedPrice('usdjpy');
    else if (pair.binance === 'audcad') startPrice = getCalibratedPrice('audusdt') * getCalibratedPrice('usdcad');
    else if (pair.binance === 'audchf') startPrice = getCalibratedPrice('audusdt') / getCalibratedPrice('chfusdt');
    else if (pair.binance === 'gbpaud') startPrice = getCalibratedPrice('gbpusdt') / getCalibratedPrice('audusdt');
    else if (pair.binance === 'eurchf') startPrice = getCalibratedPrice('eurusdt') / getCalibratedPrice('chfusdt');
    
    pair.basePrice = startPrice;
    
    const history = generateHistoricalCandles(pair, 100);
    candleHistory.set(pair.binance, history);
    console.log(`[Worker] Preloaded ${history.length} historical candles for ${pair.symbol} starting at ${startPrice}`);
  });
  
  // Load system settings
  await refreshSystemSettings();
  setInterval(refreshSystemSettings, 60 * 1000); // refresh settings cache every 1 minute

  connectBinanceWebSocket();
  startInactiveSymbolTicks();
  startCandleAggregator();

  // Start 5-minute calibration interval
  setInterval(calibrateOffsets, 5 * 60 * 1000);
}

bootstrap();
