/**
 * Phase 3 — Supplement: fetch USD/CHF and EUR/GBP only.
 * Waits 65s before first fetch to ensure fresh API minute window.
 * Merges results with existing scratch/phase3_raw.json.
 */
import https from 'https';
import fs from 'fs';
import path from 'path';

import {
  calculateEMA, calculateSMA, calculateRSI, calculateCCI,
  calculateStochastic, calculateATR, calculateSuperTrend,
  calculateADX, calculateSwingHighLow, calculateQualityScore,
} from '../src/lib/market-data/core/SignalEngine';

const API_KEY     = process.env.TWELVEDATA_API_KEY || '144352e20b9644c9bf16be2c1d67f7bd';
const OUTPUT_SIZE = 500;
const WINDOW      = 60;
const MIN_QUALITY = 83;
const PAIRS       = ['USD/CHF', 'EUR/GBP'];

interface Candle { timestamp: string; open: number; high: number; low: number; close: number; }
interface Snap {
  f0: boolean; f1: boolean; f2old: boolean; f2new: boolean;
  f3: boolean; f4: boolean; f5: boolean;
  dir: 'CALL'|'PUT'|'WAIT'; dir_old: 'CALL'|'PUT'|'WAIT';
  atrPips: number; bodyPips: number; adx: number; qScore: number;
  session: 'Asian'|'London'|'NY'|'Off'; won: boolean|null;
}

function getSession(ts: string): 'Asian'|'London'|'NY'|'Off' {
  const h = new Date(ts).getUTCHours();
  if (h >= 0  && h < 8)  return 'Asian';
  if (h >= 8  && h < 13) return 'London';
  if (h >= 13 && h < 22) return 'NY';
  return 'Off';
}

function fetchCandles(pair: string): Promise<Candle[]> {
  return new Promise(resolve => {
    const to = setTimeout(() => resolve([]), 15000);
    const opts = {
      hostname: 'api.twelvedata.com',
      path: `/time_series?symbol=${encodeURIComponent(pair)}&interval=1min&outputsize=${OUTPUT_SIZE}&timezone=UTC&apikey=${API_KEY}`,
      method: 'GET',
    };
    https.get(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        clearTimeout(to);
        try {
          const j = JSON.parse(d);
          if (!j.values) { console.warn(`  [${pair}] ${j.message || j.status}`); resolve([]); return; }
          const out: Candle[] = j.values.map((v: Record<string,string>) => {
            const dt = v.datetime.includes('T') ? v.datetime : v.datetime.replace(' ', 'T');
            return { timestamp: new Date(dt.endsWith('Z') ? dt : dt + 'Z').toISOString(),
              open: +v.open, high: +v.high, low: +v.low, close: +v.close };
          });
          resolve(out.reverse());
        } catch { clearTimeout(to); resolve([]); }
      });
    }).on('error', () => { clearTimeout(to); resolve([]); });
  });
}

function replayWindow(pair: string, candles: Candle[]): Snap|null {
  if (candles.length < WINDOW) return null;
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const idx    = closes.length - 1;

  const ema21 = calculateEMA(closes,21); const sma50 = calculateSMA(closes,50);
  const rsi   = calculateRSI(closes,14); const cci   = calculateCCI(highs,lows,closes,14);
  const stoch = calculateStochastic(highs,lows,closes,14);
  const atr   = calculateATR(highs,lows,closes,14);
  const supertrend = calculateSuperTrend(highs,lows,closes,10,3);
  const adxArr = calculateADX(highs,lows,closes,14);

  const cE21=ema21[idx],cS50=sma50[idx],cK=stoch.k[idx],cD=stoch.d[idx];
  const cRsi=rsi[idx],cCci=cci[idx],cAtr=atr[idx],cST=supertrend.values[idx];
  const cSTdir=supertrend.trend[idx],cPrice=closes[idx],cAdx=adxArr[idx]||0;

  const f1 = !(cE21===null||cS50===null||cK===null||cD===null||cRsi===null||cCci===null||cAtr===null||cST===null);
  if (!f1||cAtr===null||cE21===null||cS50===null||cK===null||cD===null||cRsi===null||cCci===null) {
    return {f0:true,f1:false,f2old:false,f2new:false,f3:false,f4:false,f5:false,
      dir:'WAIT',dir_old:'WAIT',atrPips:0,bodyPips:0,adx:cAdx,qScore:0,
      session:getSession(candles[idx].timestamp),won:null};
  }

  const atrSmaA = calculateSMA(atr.map(v=>v===null?0:v),20);
  const cAtrSma = atrSmaA[idx]||0.0001;
  const pipSize = pair.includes('JPY')?0.01:0.0001;
  const atrInPips = cAtr/pipSize;
  const f2old = (cAtr/cPrice)>=0.00015 && cAtr>cAtrSma*0.9;
  const f2new = atrInPips>=1.0           && cAtr>cAtrSma*0.9;

  const bodyAbs = Math.abs(closes[idx]-candles[idx].open);
  const bodySmaA = calculateSMA(candles.map(c=>Math.abs(c.close-c.open)),20);
  const cBodySma = bodySmaA[idx]||0.0001;
  const f3 = bodyAbs>cBodySma*0.85;
  const bodyPips = bodyAbs/pipSize;

  const isTrending=cAdx>22,isBull=cE21>cS50,isBear=cE21<cS50;
  const cK_=cK!,cD_=cD!;
  const isCallStoch=cK_>cD_&&cK_<70,isPutStoch=cK_<cD_&&cK_>30;
  const isCallCci=cCci!>0,isPutCci=cCci!<0;
  const isCallST=cSTdir===1,isPutST=cSTdir===-1;
  const {swingHigh,swingLow}=calculateSwingHighLow(highs,lows,50);
  const atrBuf=cAtr*0.5;
  const hasCallSR=(swingHigh-cPrice)>atrBuf,hasPutSR=(cPrice-swingLow)>atrBuf;
  const isOversold=cK_>cD_&&cK_<30,isOverbought=cK_<cD_&&cK_>70;

  function run(volOk: boolean): {f4:boolean;f5:boolean;dir:'CALL'|'PUT'|'WAIT';q:number} {
    if (!volOk||!f3) return {f4:false,f5:false,dir:'WAIT',q:0};
    let dir:'CALL'|'PUT'|'WAIT'='WAIT',q=0,f4m=false;
    if (isTrending) {
      if (isBull&&isCallStoch&&isCallCci&&isCallST&&hasCallSR) {
        f4m=true; q=calculateQualityScore('CALL',cPrice,ema21,sma50,rsi,cci,stoch,atr,supertrend,adxArr,f3,hasCallSR,idx);
        if (q>=MIN_QUALITY) dir='CALL';
      } else if (isBear&&isPutStoch&&isPutCci&&isPutST&&hasPutSR) {
        f4m=true; q=calculateQualityScore('PUT',cPrice,ema21,sma50,rsi,cci,stoch,atr,supertrend,adxArr,f3,hasPutSR,idx);
        if (q>=MIN_QUALITY) dir='PUT';
      }
    } else {
      if (isOversold&&isCallCci&&hasCallSR) {
        f4m=true; q=calculateQualityScore('CALL',cPrice,ema21,sma50,rsi,cci,stoch,atr,supertrend,adxArr,f3,hasCallSR,idx);
        if (q>=MIN_QUALITY) dir='CALL';
      } else if (isOverbought&&isPutCci&&hasPutSR) {
        f4m=true; q=calculateQualityScore('PUT',cPrice,ema21,sma50,rsi,cci,stoch,atr,supertrend,adxArr,f3,hasPutSR,idx);
        if (q>=MIN_QUALITY) dir='PUT';
      }
    }
    return {f4:f4m,f5:dir!=='WAIT',dir,q};
  }

  const nr=run(f2new),or=run(f2old);
  return {f0:true,f1:true,f2old,f2new,f3,f4:nr.f4,f5:nr.f5,
    dir:nr.dir,dir_old:or.dir,atrPips:atrInPips,bodyPips,adx:cAdx,qScore:nr.q,
    session:getSession(candles[idx].timestamp),won:null};
}

async function main() {
  const nowSec = new Date().getSeconds();
  const waitMs = Math.max(0, (60 - nowSec + 5) * 1000);
  console.log(`\nWaiting ${(waitMs/1000).toFixed(0)}s for fresh API minute window...`);
  await new Promise(r => setTimeout(r, waitMs));

  const newData: {pair:string;snaps:Snap[]}[] = [];

  for (const pair of PAIRS) {
    process.stdout.write(`Fetching ${pair}...`);
    const candles = await fetchCandles(pair);
    if (candles.length < WINDOW + 1) {
      console.log(` ✗ (${candles.length} candles)`);
      newData.push({pair, snaps:[]});
      continue;
    }
    console.log(` ✓ (${candles.length} candles)`);
    const snaps: Snap[] = [];
    for (let end = WINDOW; end < candles.length - 1; end++) {
      const win  = candles.slice(end - WINDOW, end);
      const snap = replayWindow(pair, win);
      if (!snap) continue;
      if (snap.dir !== 'WAIT') {
        const next = candles[end];
        snap.won = snap.dir === 'CALL' ? (next.close > next.open) : (next.close < next.open);
      }
      snaps.push(snap);
    }
    console.log(`  Replayed: ${snaps.length} windows`);
    newData.push({pair, snaps});
    await new Promise(r => setTimeout(r, 1500));
  }

  // Merge with existing raw data
  const rawPath = path.join(process.cwd(), 'scratch', 'phase3_raw.json');
  const existing: {pair:string;snaps:Snap[]}[] = JSON.parse(fs.readFileSync(rawPath,'utf8'));

  // Replace USD/CHF and EUR/GBP entries
  for (const nd of newData) {
    const idx = existing.findIndex(e => e.pair === nd.pair);
    if (idx >= 0) existing[idx] = nd;
    else existing.push(nd);
  }

  fs.writeFileSync(rawPath, JSON.stringify(existing, null, 2));
  console.log('\n✓ phase3_raw.json updated with USD/CHF and EUR/GBP data');
}

main().catch(e => { console.error(e); process.exit(1); });
