import os from "os";
import { ProviderManager } from "../src/lib/market-data/core/ProviderManager";
import { CandleCache } from "../src/lib/market-data/core/CandleCache";

async function runMetricsCheck() {
  console.log("====== SYSTEM PERFORMANCE & QUALITY MONITORS ======");

  // 1. CPU and RAM Profile
  const freeMem = os.freemem() / (1024 * 1024);
  const totalMem = os.totalmem() / (1024 * 1024);
  const cpuLoad = os.loadavg();
  console.log(`- RAM Allocation: ${(totalMem - freeMem).toFixed(2)} MB / ${totalMem.toFixed(2)} MB`);
  console.log(`- CPU System Load average (1m, 5m, 15m): [${cpuLoad.map(l => l.toFixed(2)).join(", ")}]`);

  // 2. Event Loop Lag Check
  const start = Date.now();
  await new Promise(resolve => setImmediate(resolve));
  const loopLag = Date.now() - start;
  console.log(`- Event Loop Lag: ${loopLag} ms (Threshold: < 50ms)`);
  if (loopLag > 50) throw new Error("Event loop lag exceeds acceptable threshold!");

  // 3. Ring Cache Overwrite verification
  const pairs = ["EUR/USD", "GBP/USD", "USD/JPY"];
  console.log("\n- Monitoring Cache Indicators & Oversize Limits:");
  pairs.forEach(pair => {
    const candles = CandleCache.getCandles(pair);
    const m = CandleCache.getCacheMetrics(pair);
    console.log(`  * ${pair} Cache size: ${candles.length} | Overwrites: ${m.overwriteCount} | Dropped: Ticks=${m.droppedTicks}, Candles=${m.droppedCandles}`);
  });

  console.log("\n====== ALL SYSTEMS STABLE & RUNNING ======");
}

runMetricsCheck().catch(err => {
  console.error("Monitoring script failed:", err);
  process.exit(1);
});
