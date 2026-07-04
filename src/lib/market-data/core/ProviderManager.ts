import { EventEmitter } from "events";
import { BaseProvider } from "../forex/adapters/BaseProvider";
import { NormalizedTick, ProviderMetrics } from "../types";
import { CircuitBreaker } from "./CircuitBreaker";

export type ProviderState = "INITIALIZING" | "CONNECTING" | "CONNECTED" | "DEGRADED" | "FAILOVER" | "DISCONNECTED" | "STOPPED";

export class ProviderManager extends EventEmitter {
  private providers = new Map<string, BaseProvider>();
  private metrics = new Map<string, ProviderMetrics>();
  private breakers = new Map<string, CircuitBreaker>();
  private activeProviderId: string | null = null;
  private supabaseClient: any = null;
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(supabaseClient?: any) {
    super();
    this.supabaseClient = supabaseClient || null;

    // Start background metrics synchronizer if client is supplied
    if (this.supabaseClient) {
      this.syncTimer = setInterval(() => this.syncTelemetryToDatabase(), 15000); // every 15s
    }
  }

  /**
   * Registers a provider adapter with the manager
   */
  public registerProvider(provider: BaseProvider): void {
    this.providers.set(provider.id, provider);
    
    // Initialize default metrics with INITIALIZING state
    this.metrics.set(provider.id, {
      latencyMs: 0,
      reconnectCount: 0,
      disconnectCount: 0,
      healthScore: 100,
      lastUpdate: Date.now(),
      activeFlag: false,
      state: "INITIALIZING",
      providerName: provider.id,
      providerVersion: "1.2.0",
      providerType: (provider as any).type || "WebSocket",
      requestCount: 0,
      failureCount: 0,
      lastSuccess: new Date().toISOString()
    });

    // Initialize Circuit Breaker
    this.breakers.set(provider.id, new CircuitBreaker(5, 10, 5));

    // Listen to tick events from this provider
    provider.on("tick", (tick: NormalizedTick) => {
      const m = this.metrics.get(provider.id);
      if (m) {
        m.lastUpdate = Date.now();
        m.latencyMs = Math.max(0, Date.now() - tick.timestamp);
        if (m.requestCount !== undefined) m.requestCount++;
        m.lastSuccess = new Date().toISOString();
        
        // If ticks are streaming, ensure state is CONNECTED
        if (m.state !== "CONNECTED") {
          this.setProviderState(provider.id, "CONNECTED");
        }
      }

      // Record successful tick in the breaker
      const breaker = this.breakers.get(provider.id);
      if (breaker && breaker.getState() === "OPEN") {
        breaker.recordSuccess();
      }

      // Route tick ONLY if this provider is currently active
      if (provider.id === this.activeProviderId) {
        this.emit("tick", tick);
      }
    });

    // Listen to connection state updates
    provider.on("status", ({ id, status }) => {
      const m = this.metrics.get(id);
      const breaker = this.breakers.get(id);

      if (m) {
        if (status === "disconnected" || status === "error") {
          m.disconnectCount++;
          if (m.failureCount !== undefined) m.failureCount++;
          m.healthScore = Math.max(0, m.healthScore - 15);
          
          if (breaker) {
            breaker.recordFailure();
            const breakerState = breaker.getState();
            
            // Map status values to explicit state machine statuses
            if (breakerState === "OPEN") {
              this.setProviderState(id, id === this.activeProviderId ? "FAILOVER" : "DEGRADED");
            } else {
              this.setProviderState(id, "DISCONNECTED");
            }

            // Trigger failover if active provider is tripped
            if (!breaker.isAvailable() && id === this.activeProviderId) {
              console.error(`[ProviderManager] Active provider ${id} failed health checks. Running failover swap.`);
              this.handleFailover();
            }
          } else {
            this.setProviderState(id, "DISCONNECTED");
          }
        } else if (status === "connected") {
          m.reconnectCount++;
          m.lastSuccess = new Date().toISOString();
          m.healthScore = Math.min(100, m.healthScore + 10);
          this.setProviderState(id, "CONNECTED");
          if (breaker) {
            breaker.recordSuccess();
          }
        }
      }
      this.emit("status", { id, status });
    });
  }

  /**
   * Helper to safely transitions states and emit metrics changes
   */
  private setProviderState(providerId: string, state: ProviderState) {
    const m = this.metrics.get(providerId);
    if (m && m.state !== state) {
      console.log(`[ProviderManager] Provider ${providerId} state transitioned: ${m.state} -> ${state}`);
      m.state = state;
      this.emit("state_changed", { id: providerId, state });
    }
  }

  /**
   * Automatic failover switch routing logic
   */
  private handleFailover() {
    const order = ["twelvedata", "yahoo", "simulator", "oanda"];
    for (const id of order) {
      const provider = this.providers.get(id);
      const breaker = this.breakers.get(id);
      if (provider && (!breaker || breaker.isAvailable())) {
        console.warn(`[ProviderManager] Initiating automatic failover swap to: ${id}`);
        this.setActiveProvider(id);
        return;
      }
    }
    
    // Total Outage
    console.error("[ProviderManager] CRITICAL: All data providers are unavailable!");
    this.emit("total_outage");
  }

  /**
   * Activates a specific provider, deactivating the previously active one
   */
  public setActiveProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`[ProviderManager] Provider ${providerId} is not registered.`);
    }

    const previousId = this.activeProviderId;
    this.activeProviderId = providerId;

    // Update activeFlags inside metrics
    this.metrics.forEach((m, id) => {
      m.activeFlag = (id === providerId);
      // Update state indicator for active/inactive transitions
      if (id === providerId && m.state === "FAILOVER") {
        m.state = "CONNECTED";
      }
    });

    console.log(`[ProviderManager] Active provider shifted from ${previousId} to ${providerId}`);
    this.emit("active_changed", { previousId, activeId: providerId });
  }

  /**
   * Retrieves current metrics for all registered providers
   */
  public getMetrics(): Map<string, ProviderMetrics> {
    return this.metrics;
  }

  /**
   * Syncs metrics to the Supabase provider_telemetry table
   */
  private async syncTelemetryToDatabase() {
    if (!this.supabaseClient) return;

    for (const [id, m] of this.metrics.entries()) {
      try {
        const { error } = await this.supabaseClient
          .from("provider_telemetry")
          .upsert({
            provider_id: id,
            latency_ms: m.latencyMs,
            reconnect_count: m.reconnectCount,
            disconnect_count: m.disconnectCount,
            health_score: m.healthScore,
            last_update: new Date(m.lastUpdate).toISOString(),
            active_flag: m.activeFlag,
            status: m.state, // Map explicit state word to the status db field
            updated_at: new Date().toISOString(),
            provider_name: m.providerName,
            provider_version: m.providerVersion,
            provider_latency: m.latencyMs,
            provider_health: m.healthScore,
            provider_type: m.providerType,
            request_count: m.requestCount,
            failure_count: m.failureCount,
            last_success: m.lastSuccess
          });

        if (error) {
          console.error(`[ProviderManager] Failed syncing database metrics for ${id}:`, error.message);
        }
      } catch (err: any) {
        console.error(`[ProviderManager] Exception syncing metrics for ${id}:`, err.message);
      }
    }
  }

  /**
   * Retrieves the current active provider instance
   */
  public getActiveProvider(): BaseProvider | null {
    if (!this.activeProviderId) return null;
    return this.providers.get(this.activeProviderId) || null;
  }

  /**
   * Fetches historical candles from the active provider
   */
  public async fetchHistoricCandles(pair: string, limit: number): Promise<any[]> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new Error("[ProviderManager] No active provider configured.");
    }
    return provider.fetchHistoricCandles(pair, limit);
  }

  /**
   * Fetches historical candles batch from the active provider if supported, else falls back to sequential fetches
   */
  public async fetchHistoricCandlesBatch(pairs: string[], limit: number): Promise<Map<string, any[]>> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new Error("[ProviderManager] No active provider configured.");
    }
    
    // Check if the provider has a batch fetch capability
    if (typeof (provider as any).fetchHistoricCandlesBatch === "function") {
      return (provider as any).fetchHistoricCandlesBatch(pairs, limit);
    }
    
    // Sequential fallback
    const results = new Map<string, any[]>();
    for (const pair of pairs) {
      try {
        const candles = await provider.fetchHistoricCandles(pair, limit);
        results.set(pair, candles);
      } catch (err: any) {
        console.error(`[ProviderManager] Failed fetching candles for ${pair}:`, err.message);
        results.set(pair, []);
      }
    }
    return results;
  }

  /**
   * Shuts down all registered provider connections
   */
  public async shutdown(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    for (const [id, provider] of this.providers.entries()) {
      this.setProviderState(id, "STOPPED");
      try {
        await provider.disconnect();
      } catch (err: any) {
        console.error(`[ProviderManager] Error disconnecting ${id}:`, err.message);
      }
    }
    this.providers.clear();
    this.metrics.clear();
    this.breakers.clear();
    this.activeProviderId = null;
  }
}
