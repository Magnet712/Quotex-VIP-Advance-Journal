import { BaseProvider } from "./BaseProvider";
import { NormalizedTick, NormalizedCandle } from "../../types";
import https from "https";

export class YahooProvider extends BaseProvider {
  public id = "yahoo";
  public type: "REST" | "WebSocket" = "REST";
  public supportedPairs = [
    "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD",
    "EUR/JPY", "GBP/JPY", "AUD/JPY", "USD/CHF", "EUR/GBP"
  ];
  private timer: NodeJS.Timeout | null = null;
  private pollIntervalMs = 10000; // 10 seconds polling

  public async connect(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.emitStatusChange("connected");

    this.poll();
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
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
    if (!this.active) return false;
    try {
      const activeCheck = await this.fetchYahooPrice("EURUSD=X");
      return activeCheck !== null;
    } catch {
      return false;
    }
  }

  public async fetchHistoricCandles(pair: string, limit: number): Promise<NormalizedCandle[]> {
    const yahooTicker = pair.replace("/", "").replace(" ", "") + "=X";
    return new Promise((resolve) => {
      const options = {
        hostname: "query1.finance.yahoo.com",
        path: `/v8/finance/chart/${yahooTicker}?interval=1m&range=2h`,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }
      };

      https.get(options, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.chart && json.chart.result && json.chart.result[0]) {
              const result = json.chart.result[0];
              const times = result.timestamp;
              const indicators = result.indicators.quote[0];
              const opens = indicators.open;
              const highs = indicators.high;
              const lows = indicators.low;
              const closes = indicators.close;
              const volumes = indicators.volume;

              const candles: NormalizedCandle[] = [];
              const len = Math.min(times.length, limit);
              for (let i = times.length - len; i < times.length; i++) {
                if (closes[i] !== null && opens[i] !== null) {
                  candles.push({
                    timestamp: new Date(times[i] * 1000).toISOString(),
                    open: opens[i],
                    high: highs[i],
                    low: lows[i],
                    close: closes[i],
                    volume: volumes[i] || 10,
                    cvd: 0
                  });
                }
              }
              resolve(candles);
              return;
            }
          } catch {}
          resolve([]);
        });
      }).on("error", () => resolve([]));
    });
  }

  private async poll() {
    for (const pair of this.supportedPairs) {
      if (!this.active) break;
      const yahooTicker = pair.replace("/", "").replace(" ", "") + "=X";
      const price = await this.fetchYahooPrice(yahooTicker);
      if (price !== null) {
        const tick: NormalizedTick = {
          pair,
          price,
          volume: 1,
          timestamp: Date.now(),
          source: this.id
        };
        this.emitTick(tick);
      }
    }
  }

  private fetchYahooPrice(symbol: string): Promise<number | null> {
    return new Promise((resolve) => {
      const options = {
        hostname: "query1.finance.yahoo.com",
        path: `/v8/finance/chart/${symbol}`,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }
      };

      https.get(options, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.chart && json.chart.result && json.chart.result[0]) {
              const meta = json.chart.result[0].meta;
              if (meta && meta.regularMarketPrice) {
                resolve(meta.regularMarketPrice);
                return;
              }
            }
          } catch {}
          resolve(null);
        });
      }).on("error", () => resolve(null));
    });
  }
}
