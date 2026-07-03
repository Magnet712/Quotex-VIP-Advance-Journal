import { performance } from "perf_hooks";
import { Normalizer } from "../src/lib/market-data/core/Normalizer";
import { QualityValidator } from "../src/lib/market-data/core/QualityValidator";
import { CandleCache } from "../src/lib/market-data/core/CandleCache";

async function runLoadTest() {
  console.log("====== PRODUCTION MULTI-PAIR LOAD TEST ======");

  const pairs = [
    "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD",
    "EUR/JPY", "GBP/JPY", "AUD/JPY", "USD/CHF", "EUR/GBP"
  ];
  
  const targetRates = [10, 100, 500, 1000]; // total ticks per second across all pairs
  const durationMs = 3000;

  for (const rate of targetRates) {
    console.log(`\n--- Ingestion Load: ${rate} ticks/sec across 10 currency pairs ---`);
    CandleCache.reset();
    QualityValidator.reset();

    const startCpu = process.cpuUsage();
    const startTime = performance.now();

    const loopLags: number[] = [];
    let ticksProcessed = 0;
    let peakQueueSize = 0;
    let peakHeapUsedBytes = 0;

    // In 100ms intervals, generate (rate / 10) ticks distributed over the 10 pairs
    const batchSize = rate / 10;
    const intervalId = setInterval(() => {
      for (let i = 0; i < batchSize; i++) {
        const pair = pairs[i % pairs.length];
        const t = Normalizer.normalizeTick({
          pair,
          price: 1.0850 + Math.random() * 0.001,
          timestamp: Date.now(),
          source: "load_test"
        });

        if (QualityValidator.validateTick(t)) {
          CandleCache.addTick(t);
          ticksProcessed++;

          // Peak heap footprint check
          const mem = process.memoryUsage();
          if (mem.heapUsed > peakHeapUsedBytes) {
            peakHeapUsedBytes = mem.heapUsed;
          }
        }
      }

      // Check peak queue size across all active pairs
      let currentQueueTotal = 0;
      pairs.forEach(p => {
        const candles = CandleCache.getCandles(p);
        currentQueueTotal += candles.length;
      });
      if (currentQueueTotal > peakQueueSize) {
        peakQueueSize = currentQueueTotal;
      }
    }, 100);

    // Track loop delays
    const lagIntervalId = setInterval(() => {
      const loopStart = performance.now();
      setImmediate(() => {
        loopLags.push(performance.now() - loopStart);
      });
    }, 50);

    await new Promise(resolve => setTimeout(resolve, durationMs));

    clearInterval(intervalId);
    clearInterval(lagIntervalId);

    const endCpu = process.cpuUsage(startCpu);
    const endTime = performance.now();
    const elapsedMs = endTime - startTime;

    const cpuTotalMs = (endCpu.user + endCpu.system) / 1000;
    const cpuPercent = (cpuTotalMs / elapsedMs) * 100;

    // Statistics
    loopLags.sort((a, b) => a - b);
    const avgLag = loopLags.reduce((a, b) => a + b, 0) / loopLags.length;
    const maxLag = loopLags[loopLags.length - 1] || 0;
    const p95Lag = loopLags[Math.floor(loopLags.length * 0.95)] || 0;

    console.log(`* Duration            : ${elapsedMs.toFixed(0)} ms`);
    console.log(`* Pairs Tested        : 10 pairs (${pairs.join(", ")})`);
    console.log(`* Processed Ticks     : ${ticksProcessed}`);
    console.log(`* Peak Queue Size     : ${peakQueueSize} items`);
    console.log(`* Peak Heap Memory    : ${(peakHeapUsedBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`* CPU load utilization: ${cpuPercent.toFixed(2)} %`);
    console.log(`* Peak Loop Delay (Max): ${maxLag.toFixed(2)} ms (Avg=${avgLag.toFixed(2)}ms, P95=${p95Lag.toFixed(2)}ms)`);
  }

  console.log("\n===========================================");
}

runLoadTest().catch(console.error);
