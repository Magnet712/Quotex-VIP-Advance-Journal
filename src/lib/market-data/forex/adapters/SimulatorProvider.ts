import { BaseProvider } from "./BaseProvider";
import { NormalizedTick, NormalizedCandle } from "../../types";

export class SimulatorProvider extends BaseProvider {
  public id = "simulator";
  public type: "REST" | "WebSocket" = "WebSocket";
  public supportedPairs = [
    "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD",
    "EUR/JPY", "GBP/JPY", "AUD/JPY", "USD/CHF", "EUR/GBP"
  ];
  private timer: NodeJS.Timeout | null = null;
  private basePrices = new Map<string, number>([
    ["EUR/USD", 1.0850],
    ["GBP/USD", 1.2650],
    ["USD/JPY", 160.20],
    ["AUD/USD", 0.6650],
    ["USD/CAD", 1.3580],
    ["EUR/JPY", 173.10],
    ["GBP/JPY", 202.50],
    ["AUD/JPY", 106.30],
    ["USD/CHF", 0.8950],
    ["EUR/GBP", 0.8450]
  ]);

  public async connect(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.emitStatusChange("connected");

    this.timer = setInterval(() => {
      this.supportedPairs.forEach(pair => {
        const base = this.basePrices.get(pair) || 1.0000;
        const jitter = (Math.random() - 0.5) * base * 0.0004;
        const price = parseFloat((base + jitter).toFixed(5));

        const tick: NormalizedTick = {
          pair,
          price,
          volume: Math.floor(Math.random() * 10 + 1),
          timestamp: Date.now(),
          source: this.id
        };

        this.emitTick(tick);
      });
    }, 1000);
  }

  public async disconnect(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.emitStatusChange("disconnected");
  }

  public async checkHealth(): Promise<boolean> {
    return this.active;
  }

  public async fetchHistoricCandles(pair: string, limit: number, interval?: string): Promise<NormalizedCandle[]> {
    const candles: NormalizedCandle[] = [];
    const base = this.basePrices.get(pair) || 1.0000;
    const now = Date.now();
    for (let i = limit; i > 0; i--) {
      const timeISO = new Date(now - i * 60000).toISOString();
      candles.push({
        timestamp: timeISO,
        open: base,
        high: base * 1.001,
        low: base * 0.999,
        close: base * 1.0002,
        volume: 50,
        cvd: 0
      });
    }
    return candles;
  }
}
