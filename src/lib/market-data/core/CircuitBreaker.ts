export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private openDurationMs: number;
  private maxFailures: number;
  private timeWindowMs: number;

  constructor(maxFailures = 5, timeWindowMinutes = 10, openDurationMinutes = 5) {
    this.maxFailures = maxFailures;
    this.timeWindowMs = timeWindowMinutes * 60 * 1000;
    this.openDurationMs = openDurationMinutes * 60 * 1000;
  }

  public recordSuccess(): void {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  public recordFailure(): void {
    const now = Date.now();
    if (now - this.lastFailureTime > this.timeWindowMs) {
      this.failureCount = 1;
    } else {
      this.failureCount++;
    }
    
    this.lastFailureTime = now;

    if (this.failureCount >= this.maxFailures) {
      this.state = "OPEN";
      console.error(`[CircuitBreaker] Breaker tripped! State set to OPEN. Blacklisted for ${this.openDurationMs / 60000} mins.`);
    }
  }

  public getState(): "CLOSED" | "OPEN" | "HALF_OPEN" {
    if (this.state === "OPEN") {
      const now = Date.now();
      if (now - this.lastFailureTime > this.openDurationMs) {
        this.state = "HALF_OPEN";
        console.warn("[CircuitBreaker] Cool-down period elapsed. State set to HALF_OPEN (heartbeat testing).");
      }
    }
    return this.state;
  }

  public isAvailable(): boolean {
    const state = this.getState();
    return state === "CLOSED" || state === "HALF_OPEN";
  }

  public reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = "CLOSED";
  }
}
