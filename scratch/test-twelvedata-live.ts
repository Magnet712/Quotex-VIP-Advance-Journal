import fs from "fs";
import path from "path";

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

async function testLiveAPI() {
  console.log("====== TWELVE DATA LIVE API DIAGNOSTIC ======");
  
  const provider = new TwelveDataProvider();
  
  console.log("1. Fetching historic candles for EUR/USD...");
  try {
    const candles = await provider.fetchHistoricCandles("EUR/USD", 5);
    console.log(`- Success! Preloaded ${candles.length} candles.`);
    if (candles.length > 0) {
      console.log("- Sample Candle:", JSON.stringify(candles[0], null, 2));
    } else {
      console.log("- Warning: Empty array returned. Rate limit might be hit or key invalid.");
    }
  } catch (err: any) {
    console.error("- Failed preloading candles:", err.message);
  }

  console.log("\n2. Querying api_usage endpoint status...");
  try {
    await provider.connect();
    const health = await provider.checkHealth();
    console.log(`- Health Status: ${health ? "HEALTHY" : "UNHEALTHY"}`);
    console.log(`- Credits/Rate Limit Remaining: ${provider.rateLimitRemaining}`);
    await provider.disconnect();
  } catch (err: any) {
    console.error("- Failed health check:", err.message);
  }

  console.log("\n============================================");
}

testLiveAPI();
