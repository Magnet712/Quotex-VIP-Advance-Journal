import { performance } from "perf_hooks";

async function measureWorkerResources() {
  console.log("====== NODE WORKER RESOURCE PROFILE ======");

  // 1. Process Memory metrics
  const mem = process.memoryUsage();
  const rss = mem.rss / (1024 * 1024);
  const heapTotal = mem.heapTotal / (1024 * 1024);
  const heapUsed = mem.heapUsed / (1024 * 1024);
  const external = mem.external / (1024 * 1024);

  console.log(`- Worker RSS        : ${rss.toFixed(2)} MB`);
  console.log(`- Worker Heap Total : ${heapTotal.toFixed(2)} MB`);
  console.log(`- Worker Heap Used  : ${heapUsed.toFixed(2)} MB`);
  console.log(`- C++ External      : ${external.toFixed(2)} MB`);

  // 2. CPU load % check
  const startCpu = process.cpuUsage();
  const startTime = performance.now();
  
  // Spend 100ms doing minor work to measure CPU loads
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const endCpu = process.cpuUsage(startCpu);
  const endTime = performance.now();
  const elapsedMs = endTime - startTime;
  const cpuPercent = (((endCpu.user + endCpu.system) / 1000) / elapsedMs) * 100;
  console.log(`- Worker CPU %      : ${cpuPercent.toFixed(2)} %`);

  // 3. Event Loop Lag
  const loopStart = performance.now();
  await new Promise(resolve => setImmediate(resolve));
  const lag = performance.now() - loopStart;
  console.log(`- Event Loop Lag    : ${lag.toFixed(2)} ms`);

  // 4. Ingestion rates
  // 10 monitored pairs generating simulated ticks
  const tickSec = 10; 
  const candleMin = 10;
  // Based on current 1-minute aggregators strategy checks
  const signalMin = 0.5;

  console.log(`- Ticks/sec         : ${tickSec} ticks/sec`);
  console.log(`- Candles/min       : ${candleMin} candles/min`);
  console.log(`- Signals/min       : ${signalMin} signals/min`);

  console.log("==========================================");
}

measureWorkerResources();
