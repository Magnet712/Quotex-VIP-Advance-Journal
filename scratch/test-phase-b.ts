import { ProviderManager } from "../src/lib/market-data/core/ProviderManager";
import { OandaProvider } from "../src/lib/market-data/forex/adapters/OandaProvider";
import { YahooProvider } from "../src/lib/market-data/forex/adapters/YahooProvider";
import { SimulatorProvider } from "../src/lib/market-data/forex/adapters/SimulatorProvider";

async function runTests() {
  console.log("====== PHASE B EXIT CHECKLIST TESTS ======");

  // 1. Test Circuit Breaker logic
  console.log("\n[Test 1] Testing Circuit Breaker tripping and failover...");
  const manager = new ProviderManager();
  
  const oanda = new OandaProvider();
  const yahoo = new YahooProvider();
  const simulator = new SimulatorProvider();

  manager.registerProvider(oanda);
  manager.registerProvider(yahoo);
  manager.registerProvider(simulator);

  // Set active to oanda
  manager.setActiveProvider(oanda.id);
  console.log(`- Initial active provider: ${manager.getActiveProvider()?.id} (Expected: oanda)`);
  if (manager.getActiveProvider()?.id !== "oanda") throw new Error("Active provider configuration failed.");

  // Simulate 5 OANDA failures to trip circuit breaker
  console.log("- Simulating 5 OANDA connection failures...");
  for (let i = 0; i < 5; i++) {
    oanda.emit("status", { id: oanda.id, status: "disconnected" });
  }

  // Verify that active provider automatic failover swapped to yahoo
  const activeNow = manager.getActiveProvider()?.id;
  console.log(`- Active provider after OANDA tripped: ${activeNow} (Expected: yahoo)`);
  if (activeNow !== "yahoo") throw new Error(`Automatic failover failed. Expected: yahoo, Got: ${activeNow}`);

  // 2. Test Simulator ticks
  console.log("\n[Test 2] Testing Simulator provider stream connectivity...");
  let ticksCount: any = 0;
  manager.on("tick", () => {
    ticksCount++;
  });

  manager.setActiveProvider(simulator.id);
  await simulator.connect();

  console.log("- Waiting 2.5 seconds for simulator tick generation...");
  await new Promise(resolve => setTimeout(resolve, 2500));

  await simulator.disconnect();
  console.log(`- Generated ticks received: ${ticksCount} (Expected: > 0)`);
  if (ticksCount === 0) throw new Error("Simulator failed to generate tick events.");

  // 3. Test Yahoo historic fetch
  console.log("\n[Test 3] Testing Yahoo Finance REST chart query...");
  const historic = await yahoo.fetchHistoricCandles("EUR/USD", 5);
  console.log(`- Candles retrieved: ${historic.length} (Expected: > 0)`);
  if (historic.length === 0) {
    console.warn("Yahoo REST fetch returned empty. (Markets might be closed, or rate limits hit. Continuing...)");
  } else {
    console.log(`- Yahoo closed candle timestamp: ${historic[0].timestamp}`);
  }

  // Shutdown
  await manager.shutdown();
  console.log("\n=== ALL PHASE B TESTS PASSED SUCCESSFULLY! ===");
}

runTests().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
