import { ProviderManager } from "../src/lib/market-data/core/ProviderManager";
import { TwelveDataProvider } from "../src/lib/market-data/forex/adapters/TwelveDataProvider";
import { YahooProvider } from "../src/lib/market-data/forex/adapters/YahooProvider";
import { SimulatorProvider } from "../src/lib/market-data/forex/adapters/SimulatorProvider";
import { Normalizer } from "../src/lib/market-data/core/Normalizer";
import { QualityValidator } from "../src/lib/market-data/core/QualityValidator";

async function runStage2Tests() {
  console.log("====== STAGE 2 MIGRATION TEST RUN ======");

  const manager = new ProviderManager();
  const twelvedata = new TwelveDataProvider();
  const yahoo = new YahooProvider();
  const simulator = new SimulatorProvider();

  manager.registerProvider(twelvedata);
  manager.registerProvider(yahoo);
  manager.registerProvider(simulator);

  // 1. Verify primary active configuration
  console.log("\n[Test 1] Verifying active primary provider setting...");
  manager.setActiveProvider(twelvedata.id);
  const active = manager.getActiveProvider();
  console.log(`- Active Provider: ${active?.id} (Expected: twelvedata)`);
  if (active?.id !== "twelvedata") throw new Error("Default setting is incorrect");

  // 2. Verify Normalizer standardization rules
  console.log("\n[Test 2] Testing Twelve Data Symbol Standardizer...");
  const cleanSymbol = Normalizer.standardizePair("EUR/USD");
  console.log(`- Standardized symbol: ${cleanSymbol} (Expected: EUR/USD)`);
  if (cleanSymbol !== "EUR/USD") throw new Error("Normalizer failed for standard slash symbols");

  // 3. Verify Telemetry layout contains all 012 migration parameters
  console.log("\n[Test 3] Verifying expanded Telemetry layout compatibility...");
  const metrics = manager.getMetrics().get(twelvedata.id);
  console.log(JSON.stringify(metrics, null, 2));
  if (!metrics || !("providerName" in metrics) || !("providerType" in metrics)) {
    throw new Error("Missing RC1 telemetry parameters inside provider metrics");
  }

  // 4. Verify Circuit Breaker and failover swapping
  console.log("\n[Test 4] Testing Circuit Breaker tripping and failover flow...");
  console.log("- Triggering 5 connection disconnections on Twelve Data...");
  for (let i = 0; i < 5; i++) {
    twelvedata.emit("status", { id: twelvedata.id, status: "disconnected" });
  }

  const currentActive = manager.getActiveProvider();
  console.log(`- Active Provider after TwelveData tripped: ${currentActive?.id} (Expected: yahoo)`);
  if (currentActive?.id !== "yahoo") throw new Error("Failover to Yahoo failed");

  console.log("\n====== ALL STAGE 2 TESTS PASSED! ======");
}

runStage2Tests().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
