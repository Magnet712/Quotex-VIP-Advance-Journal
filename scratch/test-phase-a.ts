import { Normalizer } from "../src/lib/market-data/core/Normalizer";
import { QualityValidator } from "../src/lib/market-data/core/QualityValidator";
import { CandleCache } from "../src/lib/market-data/core/CandleCache";
import { ProviderManager } from "../src/lib/market-data/core/ProviderManager";
import { BaseProvider } from "../src/lib/market-data/forex/adapters/BaseProvider";
import { NormalizedTick, NormalizedCandle } from "../src/lib/market-data/types";

// Helper classes to mock a provider for verification
class MockProvider extends BaseProvider {
  public id = "mock_provider";
  public supportedPairs = ["EUR/USD"];
  
  public async connect() {}
  public async disconnect() {}
  public async checkHealth() { return true; }
  public async fetchHistoricCandles() { return []; }

  public simulateTick(price: number, timestamp: number) {
    const tick = Normalizer.normalizeTick({
      pair: "EUR/USD",
      price,
      timestamp,
      source: this.id
    });
    this.emitTick(tick);
  }
}

async function runTests() {
  console.log("====== PHASE A EXIT CHECKLIST TESTS ======");

  // 1. Test Normalizer
  console.log("\n[Test 1] Running Normalizer checks...");
  const n1 = Normalizer.standardizePair("eurusd");
  const n2 = Normalizer.standardizePair("GBP_USD");
  console.log(`- eurusd -> ${n1} (Expected: EUR/USD)`);
  console.log(`- GBP_USD -> ${n2} (Expected: GBP/USD)`);
  if (n1 !== "EUR/USD" || n2 !== "GBP/USD") throw new Error("Normalizer pair standardization failed.");

  const tick = Normalizer.normalizeTick({ pair: "eur/usd", price: "1.0855", source: "test" });
  console.log(`- Normalized tick price: ${tick.price} (Type: ${typeof tick.price})`);
  if (tick.price !== 1.0855) throw new Error("Normalizer float coercion failed.");

  // 2. Test QualityValidator
  console.log("\n[Test 2] Running QualityValidator checks...");
  QualityValidator.reset();

  // Test standard valid tick (Tuesday timestamp: 1782979200000)
  const baseTick = Normalizer.normalizeTick({ pair: "EUR/USD", price: 1.0000, timestamp: 1782979200000, source: "test" });
  const v1 = QualityValidator.validateTick(baseTick);
  console.log(`- Valid tick validation: ${v1} (Expected: true)`);
  if (!v1) throw new Error("QualityValidator rejected valid tick.");

  // Test weekend filter (Saturday timestamp: 1783166400000 - Jul 4 2026)
  const weekendTick = Normalizer.normalizeTick({ pair: "EUR/USD", price: 1.0000, timestamp: 1783166400000, source: "test" });
  const vWeekend = QualityValidator.validateTick(weekendTick);
  console.log(`- Weekend tick validation: ${vWeekend} (Expected: false)`);
  if (vWeekend) throw new Error("QualityValidator failed to reject weekend FX ticks.");

  // Test price spike check (> 2%)
  const spikeTick = Normalizer.normalizeTick({ pair: "EUR/USD", price: 1.0300, timestamp: 1782979210000, source: "test" }); // +3% deviation
  const vSpike = QualityValidator.validateTick(spikeTick);
  console.log(`- Spike tick validation (+3%): ${vSpike} (Expected: false)`);
  if (vSpike) throw new Error("QualityValidator failed to reject price spike deviation.");

  // 3. Test CandleCache Ring-Buffer Limit
  console.log("\n[Test 3] Running CandleCache checks...");
  CandleCache.reset();
  for (let i = 0; i < 250; i++) {
    const t = Normalizer.normalizeTick({ pair: "EUR/USD", price: 1.0000 + i * 0.0001, timestamp: Date.now(), source: "test" });
    CandleCache.addTick(t);
    CandleCache.closeMinuteCandle("EUR/USD", new Date().toISOString());
  }
  const cached = CandleCache.getCandles("EUR/USD");
  console.log(`- Cache length: ${cached.length} (Expected: 200)`);
  if (cached.length !== 200) throw new Error(`CandleCache exceeded maximum capacity: ${cached.length}`);

  // 4. Test ProviderManager Routing
  console.log("\n[Test 4] Running ProviderManager checks...");
  const manager = new ProviderManager();
  const mock = new MockProvider();
  manager.registerProvider(mock);

  let ticksRouted: any = 0;
  manager.on("tick", () => {
    ticksRouted++;
  });

  // Verify ticks are not routed before provider is set active
  mock.simulateTick(1.0850, Date.now());
  console.log(`- Ticks routed before activation: ${ticksRouted} (Expected: 0)`);
  if (ticksRouted !== 0) throw new Error("ProviderManager routed tick from inactive provider.");

  // Set active and verify ticks are routed
  manager.setActiveProvider(mock.id);
  mock.simulateTick(1.0851, Date.now());
  console.log(`- Ticks routed after activation: ${ticksRouted} (Expected: 1)`);
  if (ticksRouted !== 1) throw new Error("ProviderManager failed to route tick from active provider.");

  console.log("\n=== ALL TESTS PASSED SUCCESSFULLY! ===");
}

runTests().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
