import { BaseProvider } from "./BaseProvider";
import { NormalizedTick, NormalizedCandle } from "../../types";
import https from "https";
import WebSocket from "ws";

export class TwelveDataProvider extends BaseProvider {
  public id = "twelvedata";
  public supportedPairs = [
    "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD",
    "EUR/JPY", "GBP/JPY", "AUD/JPY", "USD/CHF", "EUR/GBP"
  ];

  private apiKey: string | null = null;
  private ws: WebSocket | null = null;
  private restInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  public rateLimitRemaining: number = 800;

  constructor() {
    super();
    this.apiKey = process.env.TWELVEDATA_API_KEY || null;
  }

  public async connect(): Promise<void> {
    if (this.active) return;
    this.active = true;

    if (!this.apiKey) {
      console.warn("[TwelveData] API Key missing. Running in simulated fallback mode.");
      this.emitStatusChange("error");
      return;
    }

    this.connectWebSocket();
  }

  public async disconnect(): Promise<void> {
    if (!this.active) return;
    this.active = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.restInterval) {
      clearInterval(this.restInterval);
      this.restInterval = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.emitStatusChange("disconnected");
  }

  public async checkHealth(): Promise<boolean> {
    if (!this.active) return false;
    if (!this.apiKey) return false;

    return new Promise((resolve) => {
      const options = {
        hostname: "api.twelvedata.com",
        path: `/api_usage?apikey=${this.apiKey}`,
        method: "GET"
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 200) {
          let data = "";
          res.on("data", chunk => data += chunk);
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              if (json.timestamp) {
                if (json.plan_limits) {
                  this.rateLimitRemaining = json.plan_limits.remaining || 800;
                }
                resolve(true);
                return;
              }
            } catch {}
            resolve(false);
          });
        } else {
          resolve(false);
        }
      });
      req.on("error", () => resolve(false));
      req.end();
    });
  }

  public async fetchHistoricCandles(pair: string, limit: number): Promise<NormalizedCandle[]> {
    if (!this.apiKey) {
      console.warn("[TwelveData] Credentials missing, returning empty historic backfill.");
      return [];
    }

    return new Promise((resolve) => {
      const options = {
        hostname: "api.twelvedata.com",
        path: `/time_series?symbol=${pair}&interval=1min&outputsize=${limit}&apikey=${this.apiKey}`,
        method: "GET"
      };

      https.get(options, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.values && Array.isArray(json.values)) {
              const candles = json.values.map((v: any) => ({
                timestamp: new Date(v.datetime + " UTC").toISOString(),
                open: parseFloat(v.open),
                high: parseFloat(v.high),
                low: parseFloat(v.low),
                close: parseFloat(v.close),
                volume: parseInt(v.volume || "0"),
                cvd: 0
              }));
              resolve(candles.reverse());
              return;
            }
          } catch {}
          resolve([]);
        });
      }).on("error", () => resolve([]));
    });
  }

  private connectWebSocket() {
    if (!this.active || !this.apiKey) return;

    const url = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${this.apiKey}`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[TwelveData] WebSocket opened. Sending subscriptions...");
      this.emitStatusChange("connected");

      const subscribeMsg = {
        action: "subscribe",
        params: {
          symbols: this.supportedPairs.join(",")
        }
      };
      this.ws?.send(JSON.stringify(subscribeMsg));
    });

    this.ws.on("message", (data: any) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.event === "price") {
          const tick: NormalizedTick = {
            pair: parsed.symbol,
            price: parseFloat(parsed.price),
            volume: 1,
            timestamp: parsed.timestamp ? parsed.timestamp * 1000 : Date.now(),
            source: this.id
          };
          this.emitTick(tick);
        }
      } catch (err: any) {
        console.error("[TwelveData Parse Error]:", err.message);
      }
    });

    this.ws.on("close", () => {
      console.warn("[TwelveData] WebSocket closed. Running REST polling fallback...");
      this.emitStatusChange("disconnected");
      this.startRESTFallback();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err: any) => {
      console.error("[TwelveData WebSocket Error]:", err.message);
      this.emitStatusChange("error");
      this.startRESTFallback();
    });
  }

  private startRESTFallback() {
    if (this.restInterval) return;

    console.log("[TwelveData] Starting REST fallback poller...");
    this.restInterval = setInterval(async () => {
      if (!this.active || !this.apiKey) return;

      const symbols = this.supportedPairs.join(",");
      const options = {
        hostname: "api.twelvedata.com",
        path: `/price?symbol=${symbols}&apikey=${this.apiKey}`,
        method: "GET"
      };

      https.get(options, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            this.supportedPairs.forEach(pair => {
              const item = json[pair];
              if (item && item.price) {
                const tick: NormalizedTick = {
                  pair,
                  price: parseFloat(item.price),
                  volume: 1,
                  timestamp: Date.now(),
                  source: this.id
                };
                this.emitTick(tick);
              }
            });
          } catch {}
        });
      }).on("error", () => {});
    }, 10000);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.active) {
        console.log("[TwelveData] Reconnecting WebSocket...");
        if (this.restInterval) {
          clearInterval(this.restInterval);
          this.restInterval = null;
        }
        this.connectWebSocket();
      }
    }, 15000);
  }
}
