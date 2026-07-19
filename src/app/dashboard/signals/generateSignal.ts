// ─── Seeded deterministic random ────────────────────────────────────────────
function sr(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const OF_CALL = [
  { pattern: 'Seller Absorbed by Buyer', icon: '⬆', desc: 'Sellers overwhelmed — Bulls dominating close' },
  { pattern: "Buyer's Aggression", icon: '⚡', desc: 'Strong buying momentum at candle close' },
  { pattern: 'Rejection by Buyer', icon: '↩', desc: 'Lower wick speed rejection — bullish intent' },
];
const OF_PUT = [
  { pattern: 'Buyer Absorbed by Seller', icon: '⬇', desc: 'Buyers overwhelmed — Bears dominating close' },
  { pattern: "Seller's Aggression", icon: '⚡', desc: 'Strong selling momentum at candle close' },
  { pattern: 'Rejection by Seller', icon: '↪', desc: 'Upper wick speed rejection — bearish intent' },
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

const OTC_PAIRS = [
  { symbol: 'EUR/USD', short: 'EURUSD', base: 1.08450, pip: 5, vol: 'MEDIUM' },
  { symbol: 'GBP/USD', short: 'GBPUSD', base: 1.26500, pip: 5, vol: 'HIGH' },
  { symbol: 'USD/JPY', short: 'USDJPY', base: 149.500, pip: 2, vol: 'MEDIUM' },
  { symbol: 'AUD/USD', short: 'AUDUSD', base: 0.65200, pip: 5, vol: 'MEDIUM' },
  { symbol: 'USD/CAD', short: 'USDCAD', base: 1.35800, pip: 5, vol: 'LOW' },
  { symbol: 'EUR/JPY', short: 'EURJPY', base: 162.100, pip: 2, vol: 'HIGH' },
  { symbol: 'GBP/JPY', short: 'GBPJPY', base: 189.200, pip: 2, vol: 'HIGH' },
  { symbol: 'EUR/GBP', short: 'EURGBP', base: 0.85700, pip: 5, vol: 'LOW' },
  { symbol: 'NZD/USD', short: 'NZDUSD', base: 0.59800, pip: 5, vol: 'MEDIUM' },
  { symbol: 'USD/CHF', short: 'USDCHF', base: 0.90400, pip: 5, vol: 'LOW' },
  { symbol: 'EUR/AUD', short: 'EURAUD', base: 1.66200, pip: 5, vol: 'MEDIUM' },
  { symbol: 'GBP/AUD', short: 'GBPAUD', base: 1.93600, pip: 5, vol: 'HIGH' },
  { symbol: 'AUD/JPY', short: 'AUDJPY', base: 97.500, pip: 2, vol: 'HIGH' },
  { symbol: 'CAD/JPY', short: 'CADJPY', base: 110.200, pip: 2, vol: 'MEDIUM' },
  { symbol: 'CHF/JPY', short: 'CHFJPY', base: 165.400, pip: 2, vol: 'MEDIUM' },
  { symbol: 'EUR/CAD', short: 'EURCAD', base: 1.47300, pip: 5, vol: 'MEDIUM' },
  { symbol: 'GBP/CAD', short: 'GBPCAD', base: 1.71500, pip: 5, vol: 'HIGH' },
  { symbol: 'USD/SGD', short: 'USDSGD', base: 1.34200, pip: 5, vol: 'LOW' },
  { symbol: 'USD/INR', short: 'USDINR', base: 83.650, pip: 2, vol: 'LOW' },
  { symbol: 'USD/BRL', short: 'USDBRL', base: 4.98500, pip: 3, vol: 'HIGH' },
  { symbol: 'USD/MXN', short: 'USDMXN', base: 17.1500, pip: 3, vol: 'HIGH' },
  { symbol: 'EUR/CHF', short: 'EURCHF', base: 0.97800, pip: 5, vol: 'LOW' },
  { symbol: 'GBP/CHF', short: 'GBPCHF', base: 1.13200, pip: 5, vol: 'MEDIUM' },
  { symbol: 'AUD/CAD', short: 'AUDCAD', base: 0.89600, pip: 5, vol: 'MEDIUM' },
  { symbol: 'AUD/NZD', short: 'AUDNZD', base: 1.09100, pip: 5, vol: 'MEDIUM' },
  { symbol: 'NZD/JPY', short: 'NZDJPY', base: 89.700, pip: 2, vol: 'HIGH' },
  { symbol: 'GBP/NZD', short: 'GBPNZD', base: 2.11500, pip: 5, vol: 'HIGH' },
  { symbol: 'EUR/NZD', short: 'EURNZD', base: 1.81200, pip: 5, vol: 'MEDIUM' },
  { symbol: 'CAD/CHF', short: 'CADCHF', base: 0.66600, pip: 5, vol: 'LOW' },
  { symbol: 'USD/ZAR', short: 'USDZAR', base: 18.6500, pip: 3, vol: 'HIGH' },
  { symbol: 'USD/TRY', short: 'USDTRY', base: 32.4500, pip: 3, vol: 'HIGH' },
  { symbol: 'USD/ARS', short: 'USDARS', base: 920.00, pip: 1, vol: 'HIGH' },
  { symbol: 'USD/PKR', short: 'USDPKR', base: 278.50, pip: 1, vol: 'HIGH' },
  { symbol: 'USD/BDT', short: 'USDBDT', base: 109.80, pip: 1, vol: 'MEDIUM' },
];

interface GeneratedSignal {
  direction: 'CALL' | 'PUT';
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

function generateSignal(pairIdx: number, windowSeed: number): GeneratedSignal | null {
  const s = pairIdx * 7919 + windowSeed;

  const rsi = sr(s + 0.1) * 100;
  const smaVsEma = (sr(s + 0.2) - 0.5) * 0.004;
  const upperWick = sr(s + 0.3);
  const lowerWick = sr(s + 0.4);
  const ofRoll = sr(s + 0.5);
  const noiseRoll = sr(s + 0.6);

  const stochK = Math.round((sr(s + 12.5) * 100) * 10) / 10;
  const stochD = Math.round(Math.max(0, Math.min(100, stochK + (sr(s + 13.5) - 0.5) * 15)) * 10) / 10;

  let stochBias = 'NEUTRAL';
  const stochOversold = stochK < 20 && stochD < 20;
  const stochOverbought = stochK > 80 && stochD > 80;
  const isKAboveD = stochK > stochD;
  const crossRoll = sr(s + 14.5);

  let stochBull = false;
  let stochBear = false;

  if (stochOversold) {
    if (isKAboveD && crossRoll > 0.4) {
      stochBias = 'BULL CROSS';
      stochBull = true;
    } else {
      stochBias = 'OVERSOLD';
      stochBull = true;
    }
  } else if (stochOverbought) {
    if (!isKAboveD && crossRoll > 0.4) {
      stochBias = 'BEAR CROSS';
      stochBear = true;
    } else {
      stochBias = 'OVERBOUGHT';
      stochBear = true;
    }
  } else {
    if (isKAboveD && stochK < 50 && crossRoll > 0.7) {
      stochBias = 'BULL CROSS';
      stochBull = true;
    } else if (!isKAboveD && stochK > 50 && crossRoll > 0.7) {
      stochBias = 'BEAR CROSS';
      stochBear = true;
    } else {
      stochBias = isKAboveD ? 'BULL BIAS' : 'BEAR BIAS';
    }
  }

  const rsiBull = rsi < 32;
  const rsiBear = rsi > 68;
  const smaBull = smaVsEma > 0.0004;
  const smaBear = smaVsEma < -0.0004;
  const wickBull = lowerWick > upperWick * 1.6;
  const wickBear = upperWick > lowerWick * 1.6;
  const ofBull = ofRoll > 0.48;

  const atrRaw = 0.05 + sr(s + 20.5) * 0.40;
  const atr = Math.round(atrRaw * 1000) / 1000;
  const atrLevel = atrRaw > 0.30 ? 'HIGH VOLATILITY' : atrRaw < 0.12 ? 'LOW VOLATILITY' : 'NORMAL';
  const atrDirRoll = sr(s + 20.9);
  const atrBull = atrRaw > 0.18 && atrDirRoll > 0.50;
  const atrBear = atrRaw > 0.18 && atrDirRoll <= 0.50;

  const stRoll = sr(s + 21.5);
  const stBullBias = stRoll > 0.45;
  const stStrRoll = sr(s + 22.5);
  const superTrend = stBullBias ? 'BULLISH' : 'BEARISH';
  const superTrendStrength = stStrRoll > 0.5 ? 'STRONG' : 'MODERATE';
  const stBull = superTrend === 'BULLISH';
  const stBear = superTrend === 'BEARISH';

  const odRaw = (sr(s + 23.5) - 0.5) * 200;
  const orderDelta = Math.round(odRaw);
  const orderDeltaBull = orderDelta > 15;
  const orderDeltaBear = orderDelta < -15;
  const orderDeltaBias = orderDelta > 15 ? 'BUY DOMINANT' : orderDelta < -15 ? 'SELL DOMINANT' : 'BALANCED';

  let bullPts = 0;
  let bearPts = 0;

  if (rsiBull) bullPts += 3; if (rsiBear) bearPts += 3;
  if (stochBull) bullPts += 2; if (stochBear) bearPts += 2;
  if (smaBull) bullPts += 2; if (smaBear) bearPts += 2;
  if (wickBull) bullPts += 2; if (wickBear) bearPts += 2;
  if (ofBull) bullPts += 3; else bearPts += 3;
  if (atrBull) bullPts += 1; if (atrBear) bearPts += 1;
  if (stBull) bullPts += 3; if (stBear) bearPts += 3;
  if (orderDeltaBull) bullPts += 2; if (orderDeltaBear) bearPts += 2;

  const topScore = Math.max(bullPts, bearPts);
  const confirmations = Math.min(8, Math.floor(topScore / 2.2) + 1);
  if (topScore < 7 || noiseRoll < 0.28) return null;

  const direction: 'CALL' | 'PUT' = bullPts >= bearPts ? 'CALL' : 'PUT';

  const rawConf = topScore / 16;
  const confidence = Math.min(95, Math.max(80, Math.round(80 + rawConf * 15)));

  const ofList = direction === 'CALL' ? OF_CALL : OF_PUT;
  const ofPick = Math.floor(sr(s + 0.7) * ofList.length);
  const ofPattern = ofList[ofPick];

  const stgPick = Math.floor(sr(s + 0.8) * STRATEGY_TAGS.length);
  const strategy = STRATEGY_TAGS[stgPick];
  const trend = direction === 'CALL' ? '📈 Bullish' : '📉 Bearish';

  const risk: 'LOW' | 'MEDIUM' | 'HIGH' =
    confidence >= 91 ? 'LOW' : confidence >= 86 ? 'MEDIUM' : 'HIGH';

  const pair = OTC_PAIRS[pairIdx];
  const priceJitter = (sr(s + 0.9) - 0.5) * pair.base * 0.003;
  const rawPrice = pair.base + priceJitter;
  const entryPrice = rawPrice.toFixed(pair.pip);

  const rsiDisplay = Math.round(rsi * 10) / 10;
  const smaStatus =
    smaBull ? 'SMA21 > EMA50 ↑' :
      smaBear ? 'SMA21 < EMA50 ↓' : 'SMA21 ≈ EMA50';
  const wickBias =
    wickBull ? 'Lower Wick Strong (Buy Pressure)' :
      wickBear ? 'Upper Wick Strong (Sell Pressure)' : 'Balanced Wicks';

  const cvdBase = direction === 'CALL' ? 1 : -1;
  const cvdMag = 200 + Math.round(sr(s + 10.5) * 750);
  const cvdNoise = Math.round((sr(s + 11.5) - 0.5) * 120);
  const cvd = Math.round(cvdBase * cvdMag + cvdNoise);
  const cvdBias = cvd > 80 ? 'BULLISH' : cvd < -80 ? 'BEARISH' : 'NEUTRAL';

  return {
    direction, confidence, ofPattern, strategy,
    trend, risk, entryPrice, rsi: rsiDisplay,
    stochK, stochD, stochBias,
    smaStatus, wickBias, confirmations,
    cvd, cvdBias,
    atr, atrLevel,
    superTrend, superTrendStrength,
    orderDelta, orderDeltaBias,
  };
}

export { sr, OTC_PAIRS, generateSignal };
export type { GeneratedSignal };
