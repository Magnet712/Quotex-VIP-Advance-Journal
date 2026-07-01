const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
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
  { binance: 'eurusdt', symbol: 'EUR/USD' },
  { binance: 'gbpusdt', symbol: 'GBP/USD' },
  { binance: 'usdjpy',  symbol: 'USD/JPY' },
  { binance: 'audusdt', symbol: 'AUD/USD' },
  { binance: 'eurgbp',  symbol: 'EUR/GBP' },
  { binance: 'eurjpy',  symbol: 'EUR/JPY' },
  { binance: 'cadjpy',  symbol: 'CAD/JPY' },
  { binance: 'gbpjpy',  symbol: 'GBP/JPY' },
  { binance: 'audcad',  symbol: 'AUD/CAD' },
  { binance: 'audchf',  symbol: 'AUD/CHF' },
  { binance: 'gbpaud',  symbol: 'GBP/AUD' },
  { binance: 'eurchf',  symbol: 'EUR/CHF' }
];

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

async function triggerSignal(pairName, direction, entryPrice, strategy, confidence) {
  const entryTime = new Date();
  const expiryTime = new Date(entryTime.getTime() + 60 * 1000); // 1 minute expiry

  console.log(`[Worker Signal] Triggered ${direction} for ${pairName} at ${entryPrice}`);

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
      risk_level:       confidence >= 91 ? 'LOW' : confidence >= 86 ? 'MEDIUM' : 'HIGH',
      result:           'PENDING',
      source:           'live_market',
      strategy_version: 'v2.1',
      quality_score:    Math.round((80 + 80 + 80 + confidence) / 4),
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

function evaluateMarketSignals(pairConfig) {
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

  // Delta Aggression Bubble boundary (3x standard deviation of volume)
  const averageVolume = volumes.slice(idx - 14).reduce((a,b)=>a+b, 0) / 14;
  const currentCandleVolume = volumes[idx];
  const currentCandleDelta = history[idx].delta;

  const isAggressiveBuy = currentCandleDelta > 0 && currentCandleVolume > (averageVolume * 2.2);
  const isAggressiveSell = currentCandleDelta < 0 && currentCandleVolume > (averageVolume * 2.2);

  // 3. Candle wick sizes for absorption check
  const bodySize = Math.abs(closes[idx] - history[idx].open);
  const upperWick = highs[idx] - Math.max(closes[idx], history[idx].open);
  const lowerWick = Math.min(closes[idx], history[idx].open) - lows[idx];
  
  const isAbsorptionSelling = upperWick > (bodySize * 1.5) && isAggressiveBuy;
  const isAbsorptionBuying = lowerWick > (bodySize * 1.5) && isAggressiveSell;

  // ─── RULE 1: CVD Range Breakout & Delta Aggression (Continuation) ───────
  if (isBullishTrend && lastCvd > maxCvdRange && isAggressiveBuy && supertrend.trend[idx] === 1) {
    if (rsi[idx] < 68 && cci[idx] > 50) {
      triggerSignal(pairConfig.symbol, 'CALL', currentPrice, 'CVD Range Breakout + Buying Aggression', 92);
      return;
    }
  }
  if (isBearishTrend && lastCvd < minCvdRange && isAggressiveSell && supertrend.trend[idx] === -1) {
    if (rsi[idx] > 32 && cci[idx] < -50) {
      triggerSignal(pairConfig.symbol, 'PUT', currentPrice, 'CVD Range Breakout + Selling Aggression', 91);
      return;
    }
  }

  // ─── RULE 2: Absorption at extremes (Reversals) ─────────────────────────
  // Reversal Sell Alert (Overbought extremes + buying absorption)
  if (rsi[idx] > 70 || cci[idx] > 150 || stoch.k[idx] > 80) {
    if (isAbsorptionSelling) {
      triggerSignal(pairConfig.symbol, 'PUT', currentPrice, 'Delta Aggression Absorption (Reversal)', 88);
      return;
    }
  }
  // Reversal Buy Alert (Oversold extremes + selling absorption)
  if (rsi[idx] < 30 || cci[idx] < -150 || stoch.k[idx] < 20) {
    if (isAbsorptionBuying) {
      triggerSignal(pairConfig.symbol, 'CALL', currentPrice, 'Delta Aggression Absorption (Reversal)', 89);
      return;
    }
  }

  // ─── RULE 3: Stochastic + CCI Follow-up (Trend Continuation) ────────────
  if (isBullishTrend && stoch.k[idx] > stoch.d[idx] && stoch.k[idx] < 70 && cci[idx] > 0 && cci[idx] < 100) {
    // Volatility check (ensure ATR is healthy and market is active)
    const atrPct = (atr[idx] / currentPrice) * 100;
    if (atrPct > 0.02) {
      triggerSignal(pairConfig.symbol, 'CALL', currentPrice, 'Trend Oscillator Followup', 86);
      return;
    }
  }
  if (isBearishTrend && stoch.k[idx] < stoch.d[idx] && stoch.k[idx] > 30 && cci[idx] < 0 && cci[idx] > -100) {
    const atrPct = (atr[idx] / currentPrice) * 100;
    if (atrPct > 0.02) {
      triggerSignal(pairConfig.symbol, 'PUT', currentPrice, 'Trend Oscillator Followup', 85);
      return;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. WEBSOCKET REAL-TIME CONNECTION (BINANCE FEED)
// ─────────────────────────────────────────────────────────────────────────────

let ws;

function connectWebSocket() {
  console.log('[Worker] Connecting to Binance real-time WebSocket...');
  ws = new WebSocket('wss://stream.binance.com:9443/ws');

  ws.on('open', () => {
    console.log('[Worker] WebSocket connection established!');
    
    // Subscribe to monitored pairs trade ticks
    const subscribeMessage = {
      method: 'SUBSCRIBE',
      params: MONITORED_PAIRS.map(p => `${p.binance}@trade`),
      id: 1
    };
    ws.send(JSON.stringify(subscribeMessage));
  });

  ws.on('message', (data) => {
    try {
      const payload = JSON.parse(data);
      if (payload.e !== 'trade') return; // Only process trade execution ticks

      const pairBinance = payload.s.toLowerCase();
      const price = parseFloat(payload.p);
      const quantity = parseFloat(payload.q);
      const isMarketMaker = payload.m; // true = Sell order initiated, false = Buy order initiated

      // CVD delta logic: maker sell = taker buy (+delta), maker buy = taker sell (-delta)
      const delta = isMarketMaker ? -quantity : quantity;

      // Accumulate stats in tick buffer
      const buffer = tickBuffer.get(pairBinance);
      if (buffer) {
        buffer.ticks.push({ price, delta, time: payload.E });
        buffer.cvdAccumulator += delta;
        buffer.currentVolume += quantity;
        
        if (buffer.open === null) buffer.open = price;
        buffer.high = Math.max(buffer.high, price);
        buffer.low = Math.min(buffer.low, price);
        buffer.close = price;
      }
    } catch (err) {
      // Non-blocking JSON error
    }
  });

  ws.on('close', () => {
    console.warn('[Worker Warn] WebSocket disconnected! Reconnecting in 5 seconds...');
    setTimeout(connectWebSocket, 5000);
  });

  ws.on('error', (err) => {
    console.error('[Worker Error] WebSocket encountered error:', err.message);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. INTERVAL LOOP: AGGREGATE CANDLES (RUNS EVERY MINUTE AT :00 SECONDS)
// ─────────────────────────────────────────────────────────────────────────────

function startCandleAggregator() {
  // Start loop that fires exactly at the 00 second boundary of every minute
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

    // Default fallback values if no ticks happened during the last minute (low liquidity)
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
        return; // Empty starting state, wait for first tick
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
    
    // Maintain maximum historical buffer of 200 candles to prevent memory leaks
    if (history.length > 200) history.shift();

    console.log(`[Worker Tick] ${pair.symbol} Closed Candle - O: ${open}, H: ${high}, L: ${low}, C: ${close}, Vol: ${volume.toFixed(2)}, CVD: ${currentCvd.toFixed(2)}`);

    // Reset buffer for the next minute
    tickBuffer.set(pair.binance, {
      ticks: [],
      cvdAccumulator: 0,
      currentVolume: 0,
      open: null,
      high: -Infinity,
      low: Infinity,
      close: null
    });

    // Evaluate signals on the closed candle history
    try {
      evaluateMarketSignals(pair);
    } catch (err) {
      console.error(`[Worker Signal Error] Failed to evaluate pair ${pair.symbol}:`, err.message);
    }
  });

  // Automatically resolve any expired PENDING signals in the database
  autoResolveExpiredSignals();
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. BOOTSTRAP INITS
// ─────────────────────────────────────────────────────────────────────────────
console.log('===================================================');
console.log('       ORDERFLOW LIVE MARKET SIGNAL WORKER         ');
console.log('===================================================');

connectWebSocket();
startCandleAggregator();
