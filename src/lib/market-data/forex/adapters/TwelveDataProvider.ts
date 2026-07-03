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
  
  // Track active pairs with last-seen timestamps to implement 5m expiration
  private activePairs: Map<string, number> = new Map([
    ["EUR/USD", Date.now()],
    ["GBP/USD", Date.now()],
    ["USD/JPY", Date.now()]
  ]);
  
  // Flag to permanently disable WebSockets on plan/auth failures
  private wsDisabled: boolean = false;

  constructor() {
    super();
    this.apiKey = process.env.TWELVEDATA_API_KEY || null;
  }

  /**
   * Refreshes the active viewers list, keeping max 5 unique symbols
   */
  public setActivePairs(pairs: string[]): void {
    const uniquePairs = Array.from(new Set(pairs)).slice(0, 5);
    const now = Date.now();
    
    // Add or update active timestamp
    uniquePairs.forEach(p => {
      this.activePairs.set(p, now);
    });

    // Remove any pair that is not present in the new filter list
    for (const key of this.activePairs.keys()) {
      if (!uniquePairs.includes(key)) {
        this.activePairs.delete(key);
      }
    }

    console.log(`[TwelveData] Active pairs updated:`, Array.from(this.activePairs.keys()));
  }

  public async connect(): Promise<void> {
    if (this.active) return;
    this.active = true;

    if (!this.apiKey) {
      console.warn("[TwelveData] API Key missing. Running in simulated fallback mode.");
      this.emitStatusChange("error");
      return;
    }

    if (this.wsDisabled) {
      console.log("[TwelveData] WS permanently disabled. Starting REST loop directly.");
      this.startRESTFallback();
    } else {
      this.connectWebSocket();
    }
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
    if (!this.active || !this.apiKey || this.wsDisabled) return;

    const url = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${this.apiKey}`;
    this.ws = new WebSocket(url);
    const wsStartTime = Date.now();

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
      
      // If closed in under 4 seconds, assume WebSocket is unsupported on this plan/key
      if (Date.now() - wsStartTime < 4000) {
        console.warn("[TwelveData] WebSocket closed immediately. Disabling WS permanently (REST mode active).");
        this.wsDisabled = true;
      }

      if (!this.wsDisabled) {
        this.scheduleReconnect();
      } else {
        console.log("[TwelveData] WebSocket disabled. Staying in REST fallback loop.");
      }
    });

    this.ws.on("error", (err: any) => {
      console.error("[TwelveData WebSocket Error]:", err.message);
      this.emitStatusChange("error");
      
      const errMsg = err.message || "";
      if (errMsg.includes("401") || errMsg.includes("403") || errMsg.includes("1006") || errMsg.includes("PlanNotAllowed")) {
        console.warn("[TwelveData] WebSocket permission denied. Disabling WS permanently.");
        this.wsDisabled = true;
      }

      this.startRESTFallback();
    });
  }

  /**
   * Adaptive Polling Interval calculation based on active viewers and remaining API credits.
   */
  private getAdaptivePollInterval(): number {
    const numPairs = this.activePairs.size;
    if (this.rateLimitRemaining <= 0) return 0;          // Trigger failover
    if (this.rateLimitRemaining < 100) return 300000;    // 5 minutes
    if (this.rateLimitRemaining < 200) return 180000;    // 3 minutes

    // Scale interval dynamically based on active viewers count
    if (numPairs <= 1) return 30000;                     // 30 seconds
    if (numPairs <= 3) return 45000;                     // 45 seconds
    if (numPairs <= 5) return 60000;                     // 60 seconds (1 minute)
    return 90000;                                        // 90 seconds
  }

  /**
   * Clears out any active pair that hasn't had updates in 5 minutes
   */
  private sweepInactivePairs() {
    const now = Date.now();
    const expiryWindowMs = 5 * 60 * 1000; // 5 minutes
    for (const [pair, lastSeen] of this.activePairs.entries()) {
      if (now - lastSeen > expiryWindowMs) {
        console.log(`[TwelveData] Active pair ${pair} expired (no viewers for 5m). Removing.`);
        this.activePairs.delete(pair);
      }
    }
  }

  private startRESTFallback() {
    if (this.restTimeout) return;
    console.log("[TwelveData] Starting REST fallback loop...");
    this.pollREST();
  }

  private async pollREST() {
    if (!this.active || !this.apiKey) return;

    this.sweepInactivePairs();

    const interval = this.getAdaptivePollInterval();
    if (interval === 0) {
      console.error("[TwelveData] Quota completely exhausted. Triggering automatic failover swap.");
      this.emitStatusChange("error");
      return;
    }

    const pairsToPoll = Array.from(this.activePairs.keys());
    if (pairsToPoll.length === 0) {
      console.log("[TwelveData] Zero active viewers. Pausing polling loop.");
      this.restTimeout = setTimeout(() => this.pollREST(), 30000); // check again in 30s
      return;
    }

    const symbols = pairsToPoll.join(",");
    
    // Optimization: query time_series for the single latest completed 1-minute closed candle
    const options = {
      hostname: "api.twelvedata.com",
      path: `/time_series?symbol=${symbols}&interval=1min&outputsize=1&apikey=${this.apiKey}`,
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
            if (item && item.values && item.values.length > 0) {
              const latest = item.values[0];
              const closePrice = parseFloat(latest.close);
              const timeMs = new Date(latest.datetime + " UTC").getTime();
              
              if (!isNaN(closePrice)) {
                const tick: NormalizedTick = {
                  pair,
                  price: closePrice,
                  volume: parseInt(latest.volume || "0") || 1,
                  timestamp: timeMs,
                  source: this.id
                };
                this.emitTick(tick);
              }
            }
          });
        } catch (err: any) {
          console.error("[TwelveData Poll Parse Exception]:", err.message);
        }
        this.restTimeout = setTimeout(() => this.pollREST(), this.getAdaptivePollInterval());
      });
    }).on("error", () => {
      this.restTimeout = setTimeout(() => this.pollREST(), this.getAdaptivePollInterval());
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.wsDisabled) return;

    this.reconnectTimer = setTimeout(() => {
      if (this.active && !this.wsDisabled) {
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
