import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // Ensure the background signal worker daemon is launched and monitored
    if (!(global as any).__signalWorkerStarted) {
      (global as any).__signalWorkerStarted = true;
      
      const { fork } = require('child_process');
      const path = require('path');
      
      const pathParts = ['src', 'scripts', 'signal-worker.js'];
      const workerPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), ...pathParts);
      console.log(`[Instrumentation] Spawning background signal worker child process: node ${workerPath}`);
      
      const child = fork(workerPath, [], {
        env: { ...process.env },
        stdio: 'inherit'
      });
      
      child.on('error', (err: any) => {
        console.error('[Instrumentation] Background signal worker error:', err);
      });
      
      child.on('exit', (code: any) => {
        console.warn(`[Instrumentation] Background signal worker exited with code ${code}. Restarting in 5s...`);
        (global as any).__signalWorkerStarted = false; // Reset to allow restarting
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
