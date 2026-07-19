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
  private pollIntervalMs = 10000;

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Yahoo checkHealth] Health check failed: ${msg}`);
      return false;
    }
  }

  public async fetchHistoricCandles(pair: string, limit: number, interval?: string): Promise<NormalizedCandle[]> {
    return this.fetchHistoricCandlesWithRetry(pair, limit, interval, 0);
  }

  private async fetchHistoricCandlesWithRetry(pair: string, limit: number, interval?: string, attempt = 0): Promise<NormalizedCandle[]> {
    const yahooTicker = pair.replace("/", "").replace(" ", "") + "=X";
    const range = (interval === "5min" || interval === "5m") ? "1d" : "2h";
    const yahooInterval = (interval === "5min" || interval === "5m") ? "5m" : "1m";
    const candles = await this.executeCandleFetch(pair, yahooTicker, range, yahooInterval, limit, attempt);
    if (candles.length === 0 && attempt < 1) {
      console.warn(`[Yahoo] Retrying fetch for ${pair} after empty result (attempt ${attempt + 1} -> ${attempt + 2})`);
      await new Promise(r => setTimeout(r, 1000));
      return this.fetchHistoricCandlesWithRetry(pair, limit, interval, attempt + 1);
    }
    return candles;
  }

  private executeCandleFetch(pair: string, yahooTicker: string, range: string, yahooInterval: string, limit: number, attempt: number): Promise<NormalizedCandle[]> {
    return new Promise<NormalizedCandle[]>((resolve) => {
      const controller = new AbortController();
      const timeoutMs = 15000;
      const timeoutId = setTimeout(() => {
        console.warn(`[Yahoo Timeout] Request timed out after ${timeoutMs / 1000}s for ${pair} (attempt ${attempt + 1}). Aborting request.`);
        controller.abort();
      }, timeoutMs);

      const options = {
        hostname: "query1.finance.yahoo.com",
        path: `/v8/finance/chart/${yahooTicker}?interval=${yahooInterval}&range=${range}`,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        },
        signal: controller.signal
      };

      const req = https.get(options, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          clearTimeout(timeoutId);
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
              console.log(`[Yahoo] Fetched ${candles.length} candles for ${pair} (attempt ${attempt + 1})`);
              resolve(candles);
              return;
            }
            console.warn(`[Yahoo] Empty result for ${pair}: status=${res.statusCode} body=${data.slice(0, 200)}`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[Yahoo] JSON parse error for ${pair} (attempt ${attempt + 1}): ${msg}. Body: ${data.slice(0, 200)}`);
          }
          resolve([]);
        });
      });

      req.on("error", (err) => {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          console.error(`[Yahoo Error] HTTPS request aborted due to timeout for ${pair} (attempt ${attempt + 1})`);
        } else {
          console.error(`[Yahoo Error] HTTPS request failed for ${pair} (attempt ${attempt + 1}): ${err.message}`);
        }
        resolve([]);
      });
    });
  }

  private async poll() {
    const BATCH_SIZE = 3;
    const BATCH_DELAY_MS = 200;
    const pairs = [...this.supportedPairs];

    for (let i = 0; i < pairs.length && this.active; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (pair) => {
        if (!this.active) return;
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
      }));
      if (i + BATCH_SIZE < pairs.length && this.active) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    }
  }

  private async fetchYahooPrice(symbol: string): Promise<number | null> {
    return this.fetchYahooPriceWithRetry(symbol, 0);
  }

  private async fetchYahooPriceWithRetry(symbol: string, attempt: number): Promise<number | null> {
    const price = await this.executePriceFetch(symbol, attempt);
    if (price === null && attempt < 1) {
      console.warn(`[Yahoo] Retrying price fetch for ${symbol} after null result (attempt ${attempt + 1} -> ${attempt + 2})`);
      await new Promise(r => setTimeout(r, 1000));
      return this.fetchYahooPriceWithRetry(symbol, attempt + 1);
    }
    return price;
  }

  private executePriceFetch(symbol: string, attempt: number): Promise<number | null> {
    return new Promise<number | null>((resolve) => {
      const controller = new AbortController();
      const timeoutMs = 15000;
      const timeoutId = setTimeout(() => {
        console.warn(`[Yahoo Timeout] Price query timed out after ${timeoutMs / 1000}s for ${symbol} (attempt ${attempt + 1}). Aborting request.`);
        controller.abort();
      }, timeoutMs);

      const options = {
        hostname: "query1.finance.yahoo.com",
        path: `/v8/finance/chart/${symbol}`,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        },
        signal: controller.signal
      };

      const req = https.get(options, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          clearTimeout(timeoutId);
          try {
            const json = JSON.parse(data);
            if (json.chart && json.chart.result && json.chart.result[0]) {
              const meta = json.chart.result[0].meta;
              if (meta && meta.regularMarketPrice) {
                resolve(meta.regularMarketPrice);
                return;
              }
            }
            console.warn(`[Yahoo] Price fetch empty result for ${symbol}: status=${res.statusCode}`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[Yahoo] Price fetch JSON parse error for ${symbol} (attempt ${attempt + 1}): ${msg}`);
          }
          resolve(null);
        });
      });

      req.on("error", (err) => {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          console.error(`[Yahoo Error] Price request aborted due to timeout for ${symbol} (attempt ${attempt + 1})`);
        } else {
          console.error(`[Yahoo Error] Price request failed for ${symbol} (attempt ${attempt + 1}): ${err.message}`);
        }
        resolve(null);
      });
    });
  }
}
