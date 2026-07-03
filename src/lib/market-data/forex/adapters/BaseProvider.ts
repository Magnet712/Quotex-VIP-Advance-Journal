import { EventEmitter } from "events";
import { NormalizedTick, NormalizedCandle } from "../../types";

export abstract class BaseProvider extends EventEmitter {
  public abstract id: string;
  public abstract supportedPairs: string[];
  protected active: boolean = false;

  // Connection Lifecycle
  public abstract connect(): Promise<void>;
  public abstract disconnect(): Promise<void>;
  public abstract checkHealth(): Promise<boolean>;

  // Historic backfill for initialization indicators
  public abstract fetchHistoricCandles(
    pair: string,
    limit: number
  ): Promise<NormalizedCandle[]>;

  // Callback registrars
  protected emitTick(tick: NormalizedTick): void {
    this.emit("tick", tick);
  }

  protected emitStatusChange(status: "connected" | "disconnected" | "error"): void {
    this.emit("status", { id: this.id, status });
  }
}
