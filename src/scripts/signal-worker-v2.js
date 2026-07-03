const fs = require('fs');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// 1. Load Environment Variables
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

// 2. Import TS-Compiled modules or use relative module loaders
// Since these are compiled in tsc, they exist under the project directory.
const { ProviderManager } = require('../lib/market-data/core/ProviderManager');
const { QualityValidator } = require('../lib/market-data/core/QualityValidator');
const { Normalizer } = require('../lib/market-data/core/Normalizer');
const { CandleCache } = require('../lib/market-data/core/CandleCache');

const { OandaProvider } = require('../lib/market-data/forex/adapters/OandaProvider');
const { YahooProvider } = require('../lib/market-data/forex/adapters/YahooProvider');
const { SimulatorProvider } = require('../lib/market-data/forex/adapters/SimulatorProvider');

// 3. Technical Indicators (Mathematical Calculations)
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
  const trend = Array(closes.length).fill(1);
  
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

// 4. Feature Flag Cache Settings
let featureFlags = {
  marketDataV2: false,
  shadowMode: true,
  minQualityScoreLive: 83
};

async function refreshFeatureFlags() {
  try {
    const { data, error } = await supabase.from('feature_flags').select('*');
    if (!error && data) {
      data.forEach(flag => {
        if (flag.key === 'marketDataV2') featureFlags.marketDataV2 = (flag.value === 'true');
        if (flag.key === 'shadowMode') featureFlags.shadowMode = (flag.value === 'true');
        if (flag.key === 'min_quality_score_live') featureFlags.minQualityScoreLive = parseInt(flag.value) || 83;
      });
    }
  } catch (err) {
    console.error('[Worker v2] Failed loading feature flags:', err.message);
  }
}

// 5. Strategy Quality Scoring Rules
function calculateQualityScore(direction, currentPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, idx) {
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
  
  return Math.min(100, score);
}

// 6. Signal Output Writers (Production vs Shadow modes)
async function triggerSignal(pairName, direction, entryPrice, strategy, confidence, qualityScore) {
  await refreshFeatureFlags(); // Refresh config state
  
  const isProduction = featureFlags.marketDataV2;
  const isShadow = featureFlags.shadowMode;

  if (!isProduction && !isShadow) {
    console.log(`[Worker v2 Standby] Ignored signal on ${pairName}: Both production and shadow flags are disabled.`);
    return;
  }

  const entryTime = new Date();
  const expiryTime = new Date(entryTime.getTime() + 60 * 1000);
  
  // Normalized provenance metrics
  const activeProvider = manager.getActiveProvider();
  const providerId = activeProvider ? activeProvider.id : 'unknown';
  const activeMetrics = manager.getMetrics().get(providerId);

  const dataOrigin = !isProduction && isShadow ? 'SHADOW_MODE' : 
                     providerId === 'oanda' ? 'LIVE_PROVIDER' :
                     providerId === 'yahoo' ? 'REST_FALLBACK' : 'SIMULATOR';

  const sourceTableLabel = !isProduction && isShadow ? 'simulation_v2' : 'live_market';

  console.log(`[Worker v2 Signal] Ingesting to ${sourceTableLabel} for ${pairName} at ${entryPrice} via ${dataOrigin}`);

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
      source:           sourceTableLabel,
      
      // Audit & Version Metadata (DoD specifications)
      strategy_version: 'v2.3.1',
      quality_score:    qualityScore,
      is_premium:       true,
      provider_name:    providerId,
      provider_version: 'v1.1.0',
      provider_latency: activeMetrics ? activeMetrics.latencyMs : 0,
      provider_health:  activeMetrics ? activeMetrics.healthScore : 100,
      market_data_layer_version: 'v1.4.0',
      data_origin:      dataOrigin
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Worker v2 Signal Error]:', error.message);
  }
}

// 7. Core Signal Engine Rules Calculator
function evaluateMarketSignals(pairName) {
  const history = CandleCache.getCandles(pairName);
  if (history.length < 52) return;

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
  const currentPrice = closes[idx];

  const isBullishTrend = ema21[idx] > sma50[idx];
  const isBearishTrend = ema21[idx] < sma50[idx];

  // Strategy Rule A: Trend Continuation Oscillator
  if (isBullishTrend && stoch.k[idx] > stoch.d[idx] && stoch.k[idx] < 70 && cci[idx] > 0) {
    const qScore = calculateQualityScore('CALL', currentPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, idx);
    if (qScore >= featureFlags.minQualityScoreLive) {
      triggerSignal(pairName, 'CALL', currentPrice, 'Trend Oscillator Followup', 86, qScore);
    }
  } else if (isBearishTrend && stoch.k[idx] < stoch.d[idx] && stoch.k[idx] > 30 && cci[idx] < 0) {
    const qScore = calculateQualityScore('PUT', currentPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, idx);
    if (qScore >= featureFlags.minQualityScoreLive) {
      triggerSignal(pairName, 'PUT', currentPrice, 'Trend Oscillator Followup', 85, qScore);
    }
  }
}

// 8. Ingestion & Minutes Aggregator loop
const manager = new ProviderManager(supabase);
const MONITORED_PAIRS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD",
  "EUR/JPY", "GBP/JPY", "AUD/JPY", "USD/CHF", "EUR/GBP"
];

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
  const timestampISO = new Date().toISOString();
  console.log(`[Worker v2] Rolling minute candle aggregation - ${timestampISO}`);

  MONITORED_PAIRS.forEach(pair => {
    try {
      const candle = CandleCache.closeMinuteCandle(pair, timestampISO);
      if (candle) {
        console.log(`[Worker v2] Closed candle for ${pair} - Open: ${candle.open}, Close: ${candle.close}`);
        evaluateMarketSignals(pair);
      }
    } catch (err) {
      console.error(`[Worker v2 Candle Error] Failed for ${pair}:`, err.message);
    }
  });
}

// 9. Bootstrap Sequence
async function bootstrap() {
  console.log('[Worker v2] Initializing Market Data Layer...');
  await refreshFeatureFlags();

  // Create adapters
  const oanda = new OandaProvider();
  const yahoo = new YahooProvider();
  const simulator = new SimulatorProvider();

  manager.registerProvider(oanda);
  manager.registerProvider(yahoo);
  manager.registerProvider(simulator);

  // Set Oanda as primary, fallbacks will manage drops automatically via CircuitBreakers
  manager.setActiveProvider(oanda.id);

  // Connect manager and adapters
  await oanda.connect().catch(e => console.warn('OANDA Standby connect:', e.message));
  await yahoo.connect();
  await simulator.connect();

  // Hook validation filters to dispatcher
  manager.on('tick', (tick) => {
    const isValid = QualityValidator.validateTick(tick);
    if (isValid) {
      CandleCache.addTick(tick);
    }
  });

  // Pre-seed caches with historic 1m candles to ensure instant indicator calculations
  console.log('[Worker v2] Pre-seeding rolling candle caches...');
  for (const pair of MONITORED_PAIRS) {
    let history = [];
    try {
      // Query Yahoo REST endpoints for quick 2-hour backfill history
      history = await yahoo.fetchHistoricCandles(pair, 100);
      console.log(`[Worker v2] Pre-seeded ${history.length} candles for ${pair}`);
    } catch (e) {
      console.warn(`[Worker v2] Yahoo pre-seed failed for ${pair}, using simulated fallback history...`);
      history = await simulator.fetchHistoricCandles(pair, 100);
    }
    CandleCache.preloadHistory(pair, history);
  }

  // Start tick consolidator intervals
  startCandleAggregator();

  console.log('[Worker v2] Startup completed. Running in shadow testing modes...');
}

bootstrap().catch(err => {
  console.error('[Worker v2 Bootstrap Exception]:', err.message);
  process.exit(1);
});
