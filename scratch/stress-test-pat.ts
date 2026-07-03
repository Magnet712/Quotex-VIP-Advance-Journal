import { performance } from "perf_hooks";
import { Normalizer } from "../src/lib/market-data/core/Normalizer";
import { QualityValidator } from "../src/lib/market-data/core/QualityValidator";
import { CandleCache } from "../src/lib/market-data/core/CandleCache";

async function runStressTest() {
  console.log("====== PRODUCTION ACCEPTING STRESS TEST ======");

  const rates = [10, 100, 500, 1000];
  const durationMs = 3000;

  for (const rate of rates) {
    console.log(`\nTesting ingestion at ${rate} ticks/sec...`);
    CandleCache.reset();
    QualityValidator.reset();

    const startCpu = process.cpuUsage();
    const startTime = performance.now();

    const loopLags: number[] = [];
    let ticksProcessed = 0;

    // Batch size calculation per 100ms interval to bypass Windows timer constraints
    const batchSize = rate / 10;
    const intervalId = setInterval(() => {
      for (let i = 0; i < batchSize; i++) {
        const t = Normalizer.normalizeTick({
          pair: "EUR/USD",
          price: 1.0850 + Math.random() * 0.001,
          timestamp: Date.now(),
          source: "stress_test"
        });
        if (QualityValidator.validateTick(t)) {
          CandleCache.addTick(t);
          ticksProcessed++;
        }
      }
    }, 100);

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

    loopLags.sort((a, b) => a - b);
    const avgLag = loopLags.reduce((a, b) => a + b, 0) / loopLags.length;
    const maxLag = loopLags[loopLags.length - 1] || 0;
    const p95Idx = Math.floor(loopLags.length * 0.95);
    const p95Lag = loopLags[p95Idx] || 0;
    const p99Idx = Math.floor(loopLags.length * 0.99);
    const p99Lag = loopLags[p99Idx] || 0;

    const mem = process.memoryUsage();

    console.log(`- Processed ticks  : ${ticksProcessed}`);
    console.log(`- Worker Heap Used : ${(mem.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`- CPU Utilization  : ${cpuPercent.toFixed(2)} %`);
    console.log(`- Event Loop Lag   : Avg=${avgLag.toFixed(2)}ms, Max=${maxLag.toFixed(2)}ms, P95=${p95Lag.toFixed(2)}ms, P99=${p99Lag.toFixed(2)}ms`);
  }

  console.log("\n====== STRESS TEST RUN COMPLETE ======");
}

runStressTest().catch(console.error);
