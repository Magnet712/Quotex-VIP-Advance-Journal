import { EventEmitter } from "events";
import { BaseProvider } from "../forex/adapters/BaseProvider";
import { NormalizedTick, ProviderMetrics } from "../types";

export class ProviderManager extends EventEmitter {
  private providers = new Map<string, BaseProvider>();
  private metrics = new Map<string, ProviderMetrics>();
  private activeProviderId: string | null = null;

  /**
   * Registers a provider adapter with the manager
   */
  public registerProvider(provider: BaseProvider): void {
    this.providers.set(provider.id, provider);
    
    // Initialize default metrics
    this.metrics.set(provider.id, {
      latencyMs: 0,
      reconnectCount: 0,
      disconnectCount: 0,
      healthScore: 100,
      lastUpdate: Date.now(),
      activeFlag: false
    });

    // Listen to tick events from this provider
    provider.on("tick", (tick: NormalizedTick) => {
      // Update telemetry updates count & timestamp
      const m = this.metrics.get(provider.id);
      if (m) {
        m.lastUpdate = Date.now();
        m.latencyMs = Math.max(0, Date.now() - tick.timestamp);
      }

      // Route tick ONLY if this provider is currently active
      if (provider.id === this.activeProviderId) {
        this.emit("tick", tick);
      }
    });

    // Listen to connection state updates
    provider.on("status", ({ id, status }) => {
      const m = this.metrics.get(id);
      if (m) {
        if (status === "disconnected") {
          m.disconnectCount++;
          m.healthScore = Math.max(0, m.healthScore - 10);
        } else if (status === "connected") {
          m.reconnectCount++;
          m.healthScore = Math.min(100, m.healthScore + 5);
        }
      }
      this.emit("status", { id, status });
    });
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
   * Retrieves the current active provider instance
   */
  public getActiveProvider(): BaseProvider | null {
    if (!this.activeProviderId) return null;
    return this.providers.get(this.activeProviderId) || null;
  }

  /**
   * Shuts down all registered provider connections
   */
  public async shutdown(): Promise<void> {
    for (const [id, provider] of this.providers.entries()) {
      try {
        await provider.disconnect();
      } catch (err: any) {
        console.error(`[ProviderManager] Error disconnecting ${id}:`, err.message);
      }
    }
    this.providers.clear();
    this.metrics.clear();
    this.activeProviderId = null;
  }
}
