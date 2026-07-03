import { BaseProvider } from "./BaseProvider";
import { NormalizedTick, NormalizedCandle } from "../../types";
import https from "https";
import WebSocket from "ws";

export class TwelveDataProvider extends BaseProvider {
  public id = "twelvedata";
  public type: "REST" | "WebSocket" = "WebSocket";
  public supportedPairs = [
    "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD",
    "EUR/JPY", "GBP/JPY", "AUD/JPY", "USD/CHF", "EUR/GBP"
  ];

  private apiKey: string | null = null;
  private ws: WebSocket | null = null;
  private restTimeout: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  public rateLimitRemaining: number = 800;
  private activePairs: Set<string> = new Set(["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD"]);

  constructor() {
    super();
    this.apiKey = process.env.TWELVEDATA_API_KEY || null;
  }

  public setActivePairs(pairs: string[]): void {
    this.activePairs = new Set(pairs);
    console.log(`[TwelveData] Active pairs updated:`, Array.from(this.activePairs));
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

    if (this.restTimeout) {
      clearTimeout(this.restTimeout);
      this.restTimeout = null;
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
      console.warn("[TwelveData] WebSocket closed. Running REST fallback poller...");
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

  private getPollInterval(): number {
    if (this.rateLimitRemaining > 500) return 60000;      // 60 sec
    if (this.rateLimitRemaining >= 200) return 90000;     // 90 sec
    if (this.rateLimitRemaining >= 100) return 120000;    // 120 sec
    if (this.rateLimitRemaining > 0) return 300000;       // 300 sec
    return 0; // Trigger failover
  }

  private startRESTFallback() {
    if (this.restTimeout) return;
    console.log("[TwelveData] Starting REST fallback loop...");
    this.pollREST();
  }

  private async pollREST() {
    if (!this.active || !this.apiKey) return;

    const interval = this.getPollInterval();
    if (interval === 0) {
      console.error("[TwelveData] Quota completely exhausted. Triggering automatic failover swap.");
      this.emitStatusChange("error");
      return;
    }

    const pairsToPoll = Array.from(this.activePairs);
    if (pairsToPoll.length === 0) {
      this.restTimeout = setTimeout(() => this.pollREST(), interval);
      return;
    }

    const symbols = pairsToPoll.join(",");
    const options = {
      hostname: "api.twelvedata.com",
      path: `/price?symbol=${symbols}&apikey=${this.apiKey}`,
      method: "GET"
    };

    https.get(options, (res) => {
      const remainingHeader = res.headers["x-ratelimit-remaining"];
      if (remainingHeader) {
        this.rateLimitRemaining = parseInt(remainingHeader as string) || this.rateLimitRemaining;
      }

      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          pairsToPoll.forEach(pair => {
            const item = pairsToPoll.length === 1 ? json : json[pair];
            const priceStr = item?.price || (pairsToPoll.length === 1 ? json.price : null);
            if (priceStr) {
              const tick: NormalizedTick = {
                pair,
                price: parseFloat(priceStr),
                volume: 1,
                timestamp: Date.now(),
                source: this.id
              };
              this.emitTick(tick);
            }
          });
        } catch {}
        this.restTimeout = setTimeout(() => this.pollREST(), this.getPollInterval());
      });
    }).on("error", () => {
      this.restTimeout = setTimeout(() => this.pollREST(), this.getPollInterval());
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.active) {
        console.log("[TwelveData] Reconnecting WebSocket...");
        if (this.restTimeout) {
          clearTimeout(this.restTimeout);
          this.restTimeout = null;
        }
        this.connectWebSocket();
      }
    }, 15000);
  }
}
