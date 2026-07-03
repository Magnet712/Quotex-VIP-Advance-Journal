import { NormalizedTick } from "../types";

export class Normalizer {
  /**
   * Standardizes raw ticker symbols to "BASE/QUOTE" uppercase format (e.g. "EUR/USD")
   */
  public static standardizePair(pair: string): string {
    let clean = pair.toUpperCase().replace(/[\s\-_/]/g, "");
    
    // Check if the pair has a suffix like " OTC"
    const isOtc = pair.toUpperCase().includes("OTC");
    
    if (clean.endsWith("USDT") && clean.length > 4) {
      const base = clean.substring(0, clean.length - 4);
      const quote = "USD";
      return `${base}/${quote}${isOtc ? " OTC" : ""}`;
    }
    
    if (clean.length === 6) {
      return `${clean.substring(0, 3)}/${clean.substring(3, 6)}${isOtc ? " OTC" : ""}`;
    }
    
    // Maintain standard slash representation if present
    if (pair.includes("/")) {
      return pair.toUpperCase().trim();
    }
    
    return clean;
  }

  /**
   * Normalizes raw events from OANDA, Binance, Yahoo, or other sources into standard ticks
   */
  public static normalizeTick(raw: {
    pair: string;
    price: any;
    volume?: any;
    timestamp?: any;
    source: string;
  }): NormalizedTick {
    const pair = this.standardizePair(raw.pair);
    const price = parseFloat(raw.price);
    const volume = raw.volume ? parseFloat(raw.volume) : 1;
    const timestamp = raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now();
    
    if (isNaN(price)) {
      throw new Error(`[Normalizer] Invalid price parsed: ${raw.price}`);
    }

    return {
      pair,
      price,
      volume,
      timestamp,
      source: raw.source.toLowerCase()
    };
  }
}
