export interface NormalizedTick {
  pair: string;      // e.g. "EUR/USD" (Standardized uppercase slash format)
  price: number;     // Normalized float representation
  volume: number;    // Normalized transaction volume / ticks count
  timestamp: number; // UTC Unix Epoch in milliseconds
  source: string;    // e.g. "oanda" | "yahoo"
}

export interface NormalizedCandle {
  timestamp: string; // ISO 8601 UTC String
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  cvd: number;       // Cumulative Volume Delta calculated by accumulator
}

export interface ProviderMetrics {
  latencyMs: number;
  reconnectCount: number;
  disconnectCount: number;
  healthScore: number;       // Range 0 - 100 based on uptime ratios
  lastUpdate: number;        // UTC epoch of last valid tick
  activeFlag: boolean;       // Is this provider currently feeding the cache?
}
