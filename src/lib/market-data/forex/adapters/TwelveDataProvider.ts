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
  public requestCount: number = 0;
  
  private startTime: number = Date.now();
  private lastLoggedInterval: number = 60000; // Initialize to standard interval
  
  // Track active pairs with last-seen timestamps to implement 5m expiration
  private activePairs: Map<string, number> = new Map();
  
  // Flag to permanently disable WebSockets on plan/auth failures
  private wsDisabled: boolean = false;

  // Singleton Poller Protection State Guard
  private isPolling: boolean = false;

  constructor() {
    super();
    this.apiKey = process.env.TWELVEDATA_API_KEY || null;
  }

  /**
   * Refreshes the active viewers list, keeping max 5 unique symbols.
   * Bootstraps the polling scheduler dynamically if viewers appear.
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

    // Event-driven startup: start poller loop if it is not already running
    if (this.active && this.activePairs.size > 0 && !this.isPolling) {
      console.log("[TwelveData] Active dashboard viewer detected. Initializing poller dynamically.");
      this.startRESTFallback();
    }
  }

  /**
   * Estimated remaining time until quota exhaustion based on request frequency.
   */
  public getEstimatedRemainingHours(): string {
    if (this.rateLimitRemaining <= 0) return "0.0 hours";
    
    const hoursSinceStart = (Date.now() - this.startTime) / 3600000;
    const avgRequestsPerHour = this.requestCount / Math.max(0.001, hoursSinceStart);
    
    if (avgRequestsPerHour === 0) return "Infinite (Idle)";
    
    const remainingHours = this.rateLimitRemaining / avgRequestsPerHour;
    return `${remainingHours.toFixed(1)} hours`;
  }

  public async connect(): Promise<void> {
    if (this.active) return;
    this.active = true;
    console.log("[TwelveData] Provider active. Running in event-driven manual scan mode (background polling/WebSocket disabled).");
    this.emitStatusChange("connected");
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

    this.isPolling = false;
    this.emitStatusChange("disconnected");
  }

  public async checkHealth(): Promise<boolean> {
    if (!this.active) return false;
    if (!this.apiKey) return false;

    return new Promise((resolve) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn("[TwelveData checkHealth] Health check request timed out after 5s. Aborting.");
        controller.abort();
      }, 5000);

      const options = {
        hostname: "api.twelvedata.com",
        path: `/api_usage?apikey=${this.apiKey}`,
        method: "GET",
        signal: controller.signal
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 200) {
          let data = "";
          res.on("data", chunk => data += chunk);
          res.on("end", () => {
            clearTimeout(timeoutId);
            try {
              const json = JSON.parse(data);
              if (json.timestamp) {
                if (json.plan_limits) {
                  this.rateLimitRemaining = json.plan_limits.remaining || 800;
                }
                resolve(true);
                return;
              }
              console.warn(`[TwelveData checkHealth] Unexpected response format: ${data.slice(0, 200)}`);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[TwelveData checkHealth] JSON parse error: ${msg}. Body: ${data.slice(0, 200)}`);
            }
            resolve(false);
          });
        } else {
          clearTimeout(timeoutId);
          console.warn(`[TwelveData checkHealth] Non-200 status: ${res.statusCode}`);
          resolve(false);
        }
      });
      req.on("error", (err: any) => {
        clearTimeout(timeoutId);
        console.error(`[TwelveData checkHealth] HTTPS error: ${err.message}`);
        resolve(false);
      });
      req.end();
    });
  }

  public async fetchHistoricCandles(pair: string, limit: number, interval?: string): Promise<NormalizedCandle[]> {
    return this.fetchHistoricCandlesWithRetry(pair, limit, interval, 0);
  }

  private async fetchHistoricCandlesWithRetry(pair: string, limit: number, interval?: string, attempt = 0): Promise<NormalizedCandle[]> {
    if (!this.apiKey) {
      console.warn(`[TwelveData Error] Credentials missing.
Provider: TwelveData
Pair: ${pair}
Interval: ${interval || '1min'}
Reason: API Key not set inside environment variables.`);
      return [];
    }

    const twelveInterval = (interval === "5min" || interval === "5m") ? "5min" : "1min";

    const result = await new Promise<NormalizedCandle[]>((resolve) => {
      const controller = new AbortController();
      const timeoutMs = 15000;
      const timeoutId = setTimeout(() => {
        console.warn(`[TwelveData Timeout] Request timed out after ${timeoutMs / 1000}s for ${pair} (attempt ${attempt + 1}). Aborting request.`);
        controller.abort();
      }, timeoutMs);

      const options = {
        hostname: "api.twelvedata.com",
        path: `/time_series?symbol=${pair}&interval=${twelveInterval}&outputsize=${limit}&timezone=UTC&apikey=${this.apiKey}`,
        method: "GET",
        signal: controller.signal
      };

      const req = https.get(options, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          clearTimeout(timeoutId);
          try {
            const json = JSON.parse(data);
            if (json.values && Array.isArray(json.values)) {
              const exchangeTimezone = json.meta?.exchange_timezone || "UTC";
              const isConfirmedUTC = exchangeTimezone.toUpperCase() === "UTC";
              const candles = json.values.map((v: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }) => {
                let timestamp = "";
                if (isConfirmedUTC) {
                  const dtStr = v.datetime.includes("T") ? v.datetime : v.datetime.replace(" ", "T");
                  timestamp = new Date(dtStr.endsWith("Z") ? dtStr : (dtStr + "Z")).toISOString();
                } else {
                  timestamp = new Date(v.datetime + " " + exchangeTimezone).toISOString();
                }
                return {
                  timestamp,
                  open: parseFloat(v.open),
                  high: parseFloat(v.high),
                  low: parseFloat(v.low),
                  close: parseFloat(v.close),
                  volume: parseInt(v.volume || "0"),
                  cvd: 0,
                  providerTimestamp: v.datetime,
                  providerTimezone: exchangeTimezone
                };
              });
              console.log(`[TwelveData] Fetched ${candles.length} candles for ${pair} (attempt ${attempt + 1})`);
              resolve(candles.reverse());
              return;
            }
            console.error(`[TwelveData Error] API returned non-candle payload (attempt ${attempt + 1}).
Provider: TwelveData
Pair: ${pair}
Request: GET https://${options.hostname}${options.path.split('&apikey=')[0]} (API Key hidden)
Response Status: ${res.statusCode}
Response Body: ${data}
Reason: ${json.message || json.status || 'Unknown API Error'}`);
          } catch (err: any) {
            console.error(`[TwelveData Error] Failed to parse JSON response (attempt ${attempt + 1}).
Provider: TwelveData
Pair: ${pair}
Response Status: ${res.statusCode}
Response Body: ${data}
Error: ${err.message}`);
          }
          resolve([]);
        });
      });

      req.on("error", (err) => {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          console.error(`[TwelveData Error] HTTPS request aborted due to timeout (attempt ${attempt + 1}).
Provider: TwelveData
Pair: ${pair}`);
        } else {
          console.error(`[TwelveData Error] HTTPS request execution failed (attempt ${attempt + 1}).
Provider: TwelveData
Pair: ${pair}
Error: ${err.message}`);
        }
        resolve([]);
      });
    });

    if (result.length === 0 && attempt < 1) {
      console.warn(`[TwelveData] Retrying fetch for ${pair} after empty result (attempt ${attempt + 1} -> ${attempt + 2})`);
      await new Promise(r => setTimeout(r, 1000));
      return this.fetchHistoricCandlesWithRetry(pair, limit, interval, attempt + 1);
    }
    return result;
  }

  /**
   * Fetches historical candles for multiple symbols in a single batch request
   */
  public async fetchHistoricCandlesBatch(pairs: string[], limit: number, interval?: string): Promise<Map<string, NormalizedCandle[]>> {
    return this.fetchHistoricCandlesBatchWithRetry(pairs, limit, interval, 0);
  }

  private async fetchHistoricCandlesBatchWithRetry(pairs: string[], limit: number, interval?: string, attempt = 0): Promise<Map<string, NormalizedCandle[]>> {
    const results = new Map<string, NormalizedCandle[]>();
    if (!this.apiKey) {
      console.warn("[TwelveData] Credentials missing, returning empty batch backfill.");
      pairs.forEach(p => results.set(p, []));
      return results;
    }

    if (pairs.length === 0) return results;

    // For single pair, delegate to standard single-pair fetch logic
    if (pairs.length === 1) {
      const candles = await this.fetchHistoricCandlesWithRetry(pairs[0], limit, interval, attempt);
      results.set(pairs[0], candles);
      return results;
    }

    const twelveInterval = (interval === "5min" || interval === "5m") ? "5min" : "1min";

    const batchResult = await new Promise<{ map: Map<string, NormalizedCandle[]>; hadData: boolean }>((resolve) => {
      const symbols = pairs.join(",");
      const controller = new AbortController();
      const timeoutMs = 15000;
      const timeoutId = setTimeout(() => {
        console.warn(`[TwelveData Batch Timeout] Request timed out after ${timeoutMs / 1000}s for symbols: ${symbols} (attempt ${attempt + 1}). Aborting request.`);
        controller.abort();
      }, timeoutMs);

      const options = {
        hostname: "api.twelvedata.com",
        path: `/time_series?symbol=${symbols}&interval=${twelveInterval}&outputsize=${limit}&timezone=UTC&apikey=${this.apiKey}`,
        method: "GET",
        signal: controller.signal
      };

      const req = https.get(options, (res) => {
        const remainingHeader = res.headers["x-ratelimit-remaining"];
        if (remainingHeader) {
          this.rateLimitRemaining = parseInt(remainingHeader as string) || this.rateLimitRemaining;
        }

        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          clearTimeout(timeoutId);
          try {
            const json = JSON.parse(data);
            let anyData = false;
            pairs.forEach(pair => {
              const item = json[pair];
              if (item && item.values && Array.isArray(item.values)) {
                anyData = true;
                const exchangeTimezone = item.meta?.exchange_timezone || "UTC";
                const isConfirmedUTC = exchangeTimezone.toUpperCase() === "UTC";
                const candles = item.values.map((v: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }) => {
                  let timestamp = "";
                  if (isConfirmedUTC) {
                    const dtStr = v.datetime.includes("T") ? v.datetime : v.datetime.replace(" ", "T");
                    timestamp = new Date(dtStr.endsWith("Z") ? dtStr : (dtStr + "Z")).toISOString();
                  } else {
                    timestamp = new Date(v.datetime + " " + exchangeTimezone).toISOString();
                  }
                  return {
                    timestamp,
                    open: parseFloat(v.open),
                    high: parseFloat(v.high),
                    low: parseFloat(v.low),
                    close: parseFloat(v.close),
                    volume: parseInt(v.volume || "0"),
                    cvd: 0,
                    providerTimestamp: v.datetime,
                    providerTimezone: exchangeTimezone
                  };
                });
                results.set(pair, candles.reverse());
              } else if (pairs.length === 1 && json.values && Array.isArray(json.values)) {
                anyData = true;
                const exchangeTimezone = json.meta?.exchange_timezone || "UTC";
                const isConfirmedUTC = exchangeTimezone.toUpperCase() === "UTC";
                const candles = json.values.map((v: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }) => {
                  let timestamp = "";
                  if (isConfirmedUTC) {
                    const dtStr = v.datetime.includes("T") ? v.datetime : v.datetime.replace(" ", "T");
                    timestamp = new Date(dtStr.endsWith("Z") ? dtStr : (dtStr + "Z")).toISOString();
                  } else {
                    timestamp = new Date(v.datetime + " " + exchangeTimezone).toISOString();
                  }
                  return {
                    timestamp,
                    open: parseFloat(v.open),
                    high: parseFloat(v.high),
                    low: parseFloat(v.low),
                    close: parseFloat(v.close),
                    volume: parseInt(v.volume || "0"),
                    cvd: 0,
                    providerTimestamp: v.datetime,
                    providerTimezone: exchangeTimezone
                  };
                });
                results.set(pair, candles.reverse());
              } else {
                console.warn(`[TwelveData Batch] No data for ${pair} in batch response (attempt ${attempt + 1})`);
                results.set(pair, []);
              }
            });
            resolve({ map: results, hadData: anyData });
          } catch (err: any) {
            console.error(`[TwelveData Batch Fetch Error] (attempt ${attempt + 1}): ${err.message}. Body: ${data.slice(0, 300)}`);
            pairs.forEach(p => results.set(p, []));
            resolve({ map: results, hadData: false });
          }
        });
      });

      req.on("error", (err) => {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          console.error(`[TwelveData Error] HTTPS batch request aborted due to timeout (attempt ${attempt + 1}).
Symbols: ${symbols}`);
        } else {
          console.error(`[TwelveData Batch HTTPS Error] (attempt ${attempt + 1}): ${err.message}`);
        }
        pairs.forEach(p => results.set(p, []));
        resolve({ map: results, hadData: false });
      });
    });

    if (!batchResult.hadData && attempt < 1) {
      console.warn(`[TwelveData] Retrying batch fetch after empty result for ${pairs.length} pairs (attempt ${attempt + 1} -> ${attempt + 2})`);
      await new Promise(r => setTimeout(r, 1000));
      return this.fetchHistoricCandlesBatchWithRetry(pairs, limit, interval, attempt + 1);
    }

    console.log(`[TwelveData] Batch fetch completed for ${pairs.length} pairs (attempt ${attempt + 1})`);
    return batchResult.map;
  }

  private connectWebSocket() {
    if (!this.active || !this.apiKey || this.wsDisabled) return;

    const url = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${this.apiKey}`;
    this.ws = new WebSocket(url);
    const wsStartTime = Date.now();

    this.ws.on("open", () => {
      console.log("[TwelveData] WebSocket opened. Sending subscriptions... (Rate estimation started)");
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
   * Adaptive Polling Interval based on granular remaining API credit thresholds.
   * Promotes graceful, progressive degradation to protect remaining credits.
   */
  private getAdaptivePollInterval(): number {
    if (this.rateLimitRemaining <= 0) return 0;          // Trigger failover to Yahoo
    if (this.rateLimitRemaining < 10) return 900000;     // 15 minutes (Preservation Mode)
    if (this.rateLimitRemaining < 20) return 600000;     // 10 minutes
    if (this.rateLimitRemaining < 50) return 300000;     // 5 minutes
    if (this.rateLimitRemaining < 100) return 180000;    // 3 minutes
    return 60000;                                        // Standard 1-minute interval
  }

  /**
   * Calculates the exact delay in milliseconds until the next target poll window.
   * Aligns standard 60s polls to trigger exactly 5 seconds past the start of the next minute (HH:MM:05).
   */
  private getDelayUntilNextPoll(intervalMs: number): number {
    if (intervalMs === 0) return 0;
    if (intervalMs >= 180000) {
      // Low credit intervals (3m, 5m, 10m, 15m): use simple delay
      return intervalMs;
    }
    
    // Standard 60s interval: align to 5 seconds past the next minute boundary
    const now = Date.now();
    const nextMinute = Math.ceil(now / 60000) * 60000;
    const targetTime = nextMinute + 5000; // HH:MM:05 UTC
    return Math.max(1000, targetTime - now);
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
    if (this.isPolling) return;
    if (this.activePairs.size === 0) {
      console.log("[TwelveData] Zero active viewers on start fallback. Poller remains dormant.");
      return;
    }
    console.log("[TwelveData] Starting REST fallback loop...");
    this.isPolling = true;
    this.pollREST();
  }

  private async pollREST() {
    if (!this.active || !this.apiKey) {
      this.restTimeout = null;
      this.isPolling = false;
      return;
    }

    this.sweepInactivePairs();

    const interval = this.getAdaptivePollInterval();
    if (interval === 0) {
      console.error("[TwelveData] Quota completely exhausted. Triggering automatic failover swap.");
      this.restTimeout = null;
      this.isPolling = false;
      this.emitStatusChange("error");
      return;
    }

    // Log interval transition if changed
    if (interval !== this.lastLoggedInterval) {
      let mode = "Normal Mode";
      if (interval === 180000) mode = "Pre-Conservation Mode";
      if (interval === 300000) mode = "Conservation Mode";
      if (interval === 600000) mode = "Strict Conservation Mode";
      if (interval === 900000) mode = "Preservation Mode (Extreme)";
      
      const runtimeEst = this.getEstimatedRemainingHours();
      console.warn(`[TwelveData] Credits Remaining: ${this.rateLimitRemaining} (${runtimeEst} runtime left). Entering ${mode}. Polling Interval: ${(this.lastLoggedInterval / 1000).toFixed(0)}s → ${(interval / 1000).toFixed(0)}s`);
      this.lastLoggedInterval = interval;
    }

    const pairsToPoll = Array.from(this.activePairs.keys());
    if (pairsToPoll.length === 0) {
      console.log("[TwelveData] Zero active viewers. Stopping polling loop completely (dormant mode).");
      this.restTimeout = null;
      this.isPolling = false;
      return;
    }

    const symbols = pairsToPoll.join(",");
    
    // Optimization: query time_series for the single latest completed 1-minute closed candle
    const options = {
      hostname: "api.twelvedata.com",
      path: `/time_series?symbol=${symbols}&interval=1min&outputsize=1&timezone=UTC&apikey=${this.apiKey}`,
      method: "GET"
    };

    this.requestCount++; // Increment request metrics tracker

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
        
        // Dynamically reschedule only if there are still active viewers online
        if (this.active && this.activePairs.size > 0) {
          this.restTimeout = setTimeout(() => this.pollREST(), this.getDelayUntilNextPoll(this.getAdaptivePollInterval()));
        } else {
          console.log("[TwelveData] Zero active viewers. Stopping polling loop completely (dormant mode).");
          this.restTimeout = null;
          this.isPolling = false;
        }
      });
    }).on("error", (pollErr: Error) => {
      console.error(`[TwelveData Poll] HTTPS request error: ${pollErr.message}. Rescheduling poll.`);
      if (this.active && this.activePairs.size > 0) {
        this.restTimeout = setTimeout(() => this.pollREST(), this.getDelayUntilNextPoll(this.getAdaptivePollInterval()));
      } else {
        this.restTimeout = null;
        this.isPolling = false;
      }
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
