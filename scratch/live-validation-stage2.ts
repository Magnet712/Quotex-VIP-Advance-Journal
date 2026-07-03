import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";

// Load Environment Variables from local configuration file
const envLocalPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envLocalPath)) {
  const envConfig = fs.readFileSync(envLocalPath, "utf8");
  envConfig.split("\n").forEach(line => {
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
      if (key) {
        process.env[key] = value;
      }
    }
  });
}

import { TwelveDataProvider } from "../src/lib/market-data/forex/adapters/TwelveDataProvider";

async function runLiveValidation() {
  console.log("====== LIVE TWELVE DATA VALIDATION RUN ======");

  const provider = new TwelveDataProvider();

  // 1. Connection & Keys Load
  console.log("\n[Item 1] Testing Environment Variables & API Key...");
  const hasKey = !!process.env.TWELVEDATA_API_KEY;
  console.log(`- API Key Loaded: ${hasKey ? "YES" : "NO"}`);
  if (!hasKey) throw new Error("TWELVEDATA_API_KEY is missing from environment");

  // 2. Query History
  console.log("\n[Item 2] Fetching Historical Candles (EUR/USD, GBP/USD, USD/JPY)...");
  const pairs = ["EUR/USD", "GBP/USD", "USD/JPY"];
  for (const pair of pairs) {
    const start = performance.now();
    const candles = await provider.fetchHistoricCandles(pair, 5);
    const latency = performance.now() - start;
    console.log(`- ${pair}: Retrieved ${candles.length} candles in ${latency.toFixed(0)}ms`);
    if (candles.length > 0) {
      console.log(`  * Format: Open=${candles[0].open}, Close=${candles[0].close}, Time=${candles[0].timestamp}`);
    } else {
      throw new Error(`Failed retrieving candles for ${pair}`);
    }
  }

  // 3. Health & Plan Limits Check
  console.log("\n[Item 3] Executing Health Check & Rate Limit Remaining...");
  await provider.connect();
  const startHealth = performance.now();
  const healthy = await provider.checkHealth();
  const healthLatency = performance.now() - startHealth;
  console.log(`- Health Check Status: ${healthy ? "HEALTHY" : "UNHEALTHY"} (${healthLatency.toFixed(0)}ms)`);
  console.log(`- API Credits Remaining: ${provider.rateLimitRemaining}`);
  await provider.disconnect();

  // 4. Memory and System Profiling
  console.log("\n[Item 4] System Performance Status:");
  const mem = process.memoryUsage();
  console.log(`- RSS Memory : ${(mem.rss / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`- Heap Used  : ${(mem.heapUsed / (1024 * 1024)).toFixed(2)} MB`);

  console.log("\n====== LIVE VALIDATION RUN COMPLETE ======");
}

runLiveValidation().catch(e => {
  console.error("Validation failed:", e);
  process.exit(1);
});
