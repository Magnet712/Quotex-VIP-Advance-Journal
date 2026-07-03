import { BaseProvider } from "./BaseProvider";
import { NormalizedTick, NormalizedCandle } from "../../types";
import https from "https";

export class OandaProvider extends BaseProvider {
  public id = "oanda";
  public supportedPairs = [
    "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD",
    "EUR/JPY", "GBP/JPY", "AUD/JPY", "USD/CHF", "EUR/GBP"
  ];
  
  private apiKey: string | null = null;
  private accountId: string | null = null;
  private baseUrl = "api-fxtrade.oanda.com";
  private streamUrl = "stream-fxtrade.oanda.com";
  private reqStream: any = null;

  constructor() {
    super();
    this.apiKey = process.env.OANDA_API_KEY || null;
    this.accountId = process.env.OANDA_ACCOUNT_ID || null;
    
    const isSandbox = process.env.OANDA_ENV === "practice" || !this.apiKey;
    if (isSandbox) {
      this.baseUrl = "api-fxpractice.oanda.com";
      this.streamUrl = "stream-fxpractice.oanda.com";
    }
  }

  public async connect(): Promise<void> {
    if (this.active) return;
    this.active = true;

    if (!this.apiKey || !this.accountId) {
      console.warn("[OANDA] API Key or Account ID missing. Running in standby/simulate fallback mode.");
      this.emitStatusChange("error");
      return;
    }

    this.startPriceStream();
  }

  public async disconnect(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    if (this.reqStream) {
      this.reqStream.destroy();
      this.reqStream = null;
    }
    this.emitStatusChange("disconnected");
  }

  public async checkHealth(): Promise<boolean> {
    if (!this.active) return false;
    if (!this.apiKey || !this.accountId) return false;

    return new Promise((resolve) => {
      const options = {
        hostname: this.baseUrl,
        path: `/v3/accounts/${this.accountId}/summary`,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        }
      };

      const req = https.request(options, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.end();
    });
  }

  public async fetchHistoricCandles(pair: string, limit: number): Promise<NormalizedCandle[]> {
    if (!this.apiKey) {
      console.warn("[OANDA] API credentials missing, returning empty historic backfill.");
      return [];
    }

    const oandaInstrument = pair.replace("/", "_");
    return new Promise((resolve) => {
      const options = {
        hostname: this.baseUrl,
        path: `/v3/instruments/${oandaInstrument}/candles?count=${limit}&granularity=M1`,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        }
      };

      https.get(options, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.candles) {
              const candles = json.candles.map((c: any) => ({
                timestamp: new Date(c.time).toISOString(),
                open: parseFloat(c.mid.o),
                high: parseFloat(c.mid.h),
                low: parseFloat(c.mid.l),
                close: parseFloat(c.mid.c),
                volume: parseInt(c.volume),
                cvd: 0
              }));
              resolve(candles);
              return;
            }
          } catch {}
          resolve([]);
        });
      }).on("error", () => resolve([]));
    });
  }

  private startPriceStream() {
    if (!this.active || !this.apiKey || !this.accountId) return;

    const instruments = this.supportedPairs.map(p => p.replace("/", "_")).join(",");
    const options = {
      hostname: this.streamUrl,
      path: `/v3/accounts/${this.accountId}/prices/stream?instruments=${instruments}`,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`
      }
    };

    this.reqStream = https.get(options, (res) => {
      if (res.statusCode !== 200) {
        console.error(`[OANDA Stream Error] Status: ${res.statusCode}`);
        this.emitStatusChange("error");
        return;
      }

      this.emitStatusChange("connected");
      res.setEncoding("utf8");
      
      let buffer = "";
      res.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // retain incomplete line

        lines.forEach(line => {
          if (!line.trim()) return;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "PRICE") {
              const pair = parsed.instrument.replace("_", "/");
              const price = (parseFloat(parsed.bids[0].price) + parseFloat(parsed.asks[0].price)) / 2;
              
              const tick: NormalizedTick = {
                pair,
                price,
                volume: 1,
                timestamp: new Date(parsed.time).getTime(),
                source: this.id
              };

              this.emitTick(tick);
            }
          } catch (err: any) {
            console.error("[OANDA Stream Parse Exception]:", err.message);
          }
        });
      });

      res.on("end", () => {
        console.warn("[OANDA Stream] Connection closed by server.");
        this.emitStatusChange("disconnected");
        this.reconnect();
      });
    });

    this.reqStream.on("error", (err: any) => {
      console.error("[OANDA Stream Connection Error]:", err.message);
      this.emitStatusChange("disconnected");
      this.reconnect();
    });
  }

  private reconnect() {
    if (!this.active) return;
    setTimeout(() => {
      if (this.active) {
        console.log("[OANDA Stream] Reconnecting...");
        this.startPriceStream();
      }
    }, 5000);
  }
}
